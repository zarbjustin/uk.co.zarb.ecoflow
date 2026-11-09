'use strict';

import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { ControlStoragePort, ControlStorageRecord } from './stream5000ControlEngine';
import type { Stream5000ControlJournal } from './stream5000ControlLedger';
import { encodeControlStoreJournal, SqliteControlStoreOptions } from './stream5000SqliteControlStoreWorker';

/** Real offline SQLite backend, unbound and not an attestation of Homey/native qualification. */
export class Stream5000SqliteControlStore implements ControlStoragePort {
  private readonly worker: Worker;
  private readonly options: Readonly<SqliteControlStoreOptions>;
  private readonly ready: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private timer?: NodeJS.Timeout;
  private held = false;
  private busy = false;
  private sequence = 0;
  private initialized = false;
  private highWater: number;
  private pending?: { id: number; expectedRevision?: number; journal?: string;
    resolve: (record: ControlStorageRecord) => void; reject: (error: Error) => void };

  private termination?: Promise<number>;
  private shutdown?: Promise<void>;

  constructor(options: SqliteControlStoreOptions) {
    this.options = Object.freeze({ ...options });
    this.highWater = options.minimumRevision;
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve; this.rejectReady = reject;
    });
    this.ready.catch(() => {});
    this.worker = new Worker(path.join(__dirname, 'stream5000SqliteControlStoreWorker.js'), {
      workerData: { type: 'stream5000-sqlite-control-store', options: this.options },
    });
    this.timer = setTimeout(() => this.hold(), 5000);
    this.worker.on('message', (message) => {
      if (this.held) return;
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        this.hold(); return;
      }
      if (message.type === 'ready' && Object.keys(message).length === 1 && !this.initialized) {
        this.initialized = true;
        clearTimeout(this.timer); this.timer = undefined; this.resolveReady();
      } else if (message.type === 'result' && Object.keys(message).length === 3 && this.pending?.id === message.id) {
        const pending = this.pending!;
        if (message.error && (message.error !== 'conflict' || pending.expectedRevision === undefined)) {
          this.hold(); return;
        }
        if (!message.error) {
          const { record } = message;
          try {
            if (!record || Object.keys(record).length !== 4
              || record.installationKey !== this.options.installationKey || record.incarnation !== this.options.incarnation
              || !Number.isSafeInteger(record.revision) || record.revision < this.highWater
              || (pending.expectedRevision !== undefined && record.revision !== pending.expectedRevision + 1)
              || (pending.journal !== undefined && JSON.stringify(record.journal) !== pending.journal)) {
              throw new Error('Invalid control store acknowledgement');
            }
            encodeControlStoreJournal(record.installationKey, record.journal);
            this.highWater = record.revision;
          } catch {
            this.hold(); return;
          }
        }
        clearTimeout(this.timer); this.timer = undefined;
        this.pending = undefined;
        if (message.error) pending.reject(new Error('Control store CAS conflict'));
        else pending.resolve(message.record);
      } else this.hold();
    });
    this.worker.on('error', () => this.hold());
    this.worker.on('exit', () => this.hold());
  }

  /** Explicit new-namespace operation; never called by load, CAS, recovery or app startup. */
  static async provision(options: SqliteControlStoreOptions, journal: Readonly<Stream5000ControlJournal>): Promise<void> {
    const copy = JSON.parse(encodeControlStoreJournal(options.installationKey, journal));
    const worker = new Worker(path.join(__dirname, 'stream5000SqliteControlStoreWorker.js'), {
      workerData: {
        type: 'stream5000-sqlite-control-store', options: { ...options }, journal: copy, provision: true,
      },
    });
    await new Promise<void>((resolve, reject) => {
      let completed = false;
      let acknowledged = false;
      let timer: NodeJS.Timeout;
      const finish = (error?: Error) => {
        if (completed) return;
        completed = true; clearTimeout(timer);
        if (error) {
          worker.terminate().catch(() => {}); reject(error);
        } else resolve();
      };
      timer = setTimeout(() => finish(new Error('Control store provisioning outcome unknown')), 5000);
      worker.on('message', (message) => {
        if (message && message.type === 'ready' && Object.keys(message).length === 1 && !acknowledged) acknowledged = true;
        else finish(new Error('Control store provisioning failed or unknown'));
      });
      worker.on('error', () => finish(new Error('Control store provisioning failed or unknown')));
      worker.on('exit', (code) => finish(code === 0 && acknowledged ? undefined
        : new Error('Control store provisioning failed or unknown')));
    });
  }

  private hold(): void {
    this.held = true;
    clearTimeout(this.timer); this.timer = undefined;
    const error = new Error('Control store held; commit outcome may be unknown');
    this.rejectReady(error);
    this.pending?.reject(error); this.pending = undefined;
    this.termination ||= this.worker.terminate();
    this.termination.catch(() => {});
  }

  close(): Promise<void> {
    this.hold();
    this.shutdown ||= new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Owned control store worker shutdown unconfirmed')), 5000);
      this.termination!.then(() => {
        clearTimeout(timer); resolve();
      },
      () => {
        clearTimeout(timer); reject(new Error('Owned control store worker shutdown unconfirmed'));
      });
    });
    return this.shutdown;
  }

  load(key: string, signal: AbortSignal): Promise<ControlStorageRecord> {
    return this.request(key, signal, { operation: 'load' });
  }

  compareAndSwap(key: string, expected: Readonly<{ incarnation: string; revision: number }>,
    journal: Readonly<Stream5000ControlJournal>, signal: AbortSignal): Promise<ControlStorageRecord> {
    const copy = JSON.parse(encodeControlStoreJournal(key, journal));
    return this.request(key, signal, { operation: 'cas', expected: { ...expected }, journal: copy });
  }

  private async request(key: string, signal: AbortSignal, request: Record<string, unknown>): Promise<ControlStorageRecord> {
    if (signal.aborted) throw new Error('Control store request withdrawn before submission');
    if (this.held || this.busy || key !== this.options.installationKey
      || this.sequence === Number.MAX_SAFE_INTEGER) throw new Error('Control store held, busy or identity mismatch');
    this.busy = true;
    const aborted = () => this.hold();
    signal.addEventListener('abort', aborted, { once: true });
    try {
      await this.ready;
      if (this.held || signal.aborted) throw new Error('Control store request withdrawn');
      return await new Promise<ControlStorageRecord>((resolve, reject) => {
        const id = ++this.sequence;
        this.pending = {
          id,
          resolve,
          reject,
          expectedRevision: request.operation === 'cas' ? (request.expected as { revision: number }).revision : undefined,
          journal: request.operation === 'cas' ? JSON.stringify(request.journal) : undefined,
        };
        this.timer = setTimeout(() => this.hold(), 5000);
        try {
          this.worker.postMessage({ ...request, id, key });
        } catch {
          this.hold();
        }
      });
    } finally {
      signal.removeEventListener('abort', aborted);
      this.busy = false;
    }
  }
}

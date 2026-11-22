'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Stream5000ControlLedger, Stream5000ControlJournal } from './stream5000ControlLedger';
import { boundedReference } from './stream5000ReservePilot';
import type { ControlStorageRecord } from './stream5000ControlEngine';

const CONTROL_SCHEMA = 'CREATE TABLE control_record (installation_key TEXT PRIMARY KEY, incarnation TEXT NOT NULL, revision INTEGER NOT NULL, journal TEXT NOT NULL) STRICT';

export interface SqliteControlStoreOptions {
  databasePath: string;
  installationKey: string;
  incarnation: string;
  /** Independently retained floor; the database cannot authenticate its own rollback. */
  minimumRevision: number;
}

export function encodeControlStoreJournal(key: string, journal: unknown): string {
  let nodes = 0;
  let bytes = 0;
  const ancestors = new Set<object>();
  const boundedData = (value: unknown, depth: number) => {
    if (++nodes > 2048 || depth > 16) throw new Error('Control store journal nesting limit');
    if (typeof value === 'string') bytes += Buffer.byteLength(value) + 2;
    else if (value === null || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))) bytes += 24;
    else if (typeof value === 'object') {
      if (ancestors.has(value) || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) {
        throw new Error('Control store requires plain bounded data');
      }
      if (Object.getOwnPropertySymbols(value).length || (Array.isArray(value) && value.length > 2048)) {
        throw new Error('Control store rejects unbounded or hidden fields');
      }
      ancestors.add(value);
      const descriptors = Object.getOwnPropertyDescriptors(value);
      for (const [name, descriptor] of Object.entries(descriptors)) {
        if (Array.isArray(value) && name === 'length') continue;
        if (Array.isArray(value) && (!/^(0|[1-9][0-9]*)$/.test(name) || Number(name) >= value.length)) {
          throw new Error('Control store rejects non-data array fields');
        }
        if (!descriptor.enumerable || !('value' in descriptor)) throw new Error('Control store rejects accessors');
        bytes += Buffer.byteLength(name) + 4;
        boundedData(descriptor.value, depth + 1);
      }
      ancestors.delete(value);
    } else throw new Error('Control store rejects non-data journal fields');
    if (bytes > 65536) throw new Error('Control store journal size limit');
  };
  boundedData(journal, 0);
  const encoded = JSON.stringify(journal);
  if (!encoded || Buffer.byteLength(encoded) > 65536) throw new Error('Invalid control store journal');
  const supplied = JSON.parse(encoded);
  if (supplied.version !== 2) throw new Error('Control store requires a version 2 journal');
  const recovered: any = JSON.parse(JSON.stringify(new Stream5000ControlLedger({
    installationKey: key, journal: supplied,
  }).journal()));
  // Validation must not persist the planner's recovery-induced hold as an IO side effect.
  if (recovered.active) recovered.active.held = supplied.active.held;
  if (!isDeepStrictEqual(supplied, recovered)) throw new Error('Noncanonical control store journal');
  return encoded;
}

function validRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function privateParent(file: string): void {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) throw new Error('Private absolute store path required');
  const directory = path.dirname(file);
  const info = fs.lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || fs.realpathSync(directory) !== directory
    || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700) {
    throw new Error('Private owned store directory required');
  }
}

function privateFile(file: string): fs.Stats {
  privateParent(file);
  const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1
    || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600) {
    throw new Error('Private owned store file required');
  }
  return info;
}

async function start(): Promise<void> {
  const { options } = workerData;
  if (!options || !boundedReference(options.installationKey) || !boundedReference(options.incarnation)
    || !validRevision(options.minimumRevision)) throw new Error('Invalid control store identity');
  const { databasePath: file, installationKey: key, incarnation } = options;
  privateParent(file);
  const provisioning = workerData.provision === true;
  let initialJournal: string | undefined;
  if (provisioning) {
    if (options.minimumRevision !== 0) throw new Error('Provisioning requires an independently approved new namespace');
    initialJournal = encodeControlStoreJournal(key, workerData.journal);
    const parsed = JSON.parse(initialJournal) as Stream5000ControlJournal;
    if (parsed.nextClaimId !== 0 || parsed.active || parsed.frontier || parsed.legacy) {
      throw new Error('Provisioning cannot erase existing control history');
    }
    const descriptor = fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
    fs.closeSync(descriptor);
  }
  const identity = privateFile(file);
  const Sqlite = await import('node:sqlite');
  const database = new Sqlite.DatabaseSync(file);
  let listening = false;
  try {
    let floor = options.minimumRevision;
    const unchanged = () => {
      const current = privateFile(file);
      if (current.dev !== identity.dev || current.ino !== identity.ino) throw new Error('Control store file replaced');
    };
    unchanged();
    database.exec('PRAGMA busy_timeout=1000; PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON; PRAGMA trusted_schema=OFF;');
    if (database.prepare('PRAGMA journal_mode').get()?.journal_mode !== 'delete'
    || database.prepare('PRAGMA synchronous').get()?.synchronous !== 3) {
      throw new Error('Unqualified control store journal mode');
    }
    if (provisioning) {
      database.exec('BEGIN IMMEDIATE');
      try {
        database.exec(CONTROL_SCHEMA);
        database.prepare('INSERT INTO control_record VALUES (?, ?, 0, ?)').run(key, incarnation, initialJournal!);
        database.exec('COMMIT');
      } catch {
        try {
          database.exec('ROLLBACK');
        } catch { /* Commit outcome may be unknown. */ }
        throw new Error('Control store provisioning outcome unknown');
      }
    parentPort!.postMessage({ type: 'ready' });
    parentPort!.close();
    return;
    }
    const schema = database.prepare("SELECT type, name, CASE WHEN length(sql) <= 2048 THEN sql ELSE NULL END AS sql FROM sqlite_schema WHERE substr(name, 1, 7) <> 'sqlite_' LIMIT 2").all();
    if (schema.length !== 1 || schema[0].type !== 'table'
    || schema[0].name !== 'control_record' || schema[0].sql !== CONTROL_SCHEMA) {
      throw new Error('Control store schema mismatch');
    }
    const read = (): ControlStorageRecord => {
      unchanged();
      const rows = database.prepare('SELECT installation_key, incarnation, revision, '
        + 'CASE WHEN length(CAST(journal AS BLOB)) <= 65536 THEN journal ELSE NULL END AS journal FROM control_record LIMIT 2').all();
      const row = rows[0];
      if (rows.length !== 1 || row.installation_key !== key || row.incarnation !== incarnation
      || !validRevision(row.revision) || row.revision < floor || typeof row.journal !== 'string') {
        throw new Error('Control store identity or revision floor mismatch');
      }
      const journal = JSON.parse(row.journal);
      encodeControlStoreJournal(key, journal);
      return {
        installationKey: key, incarnation, revision: row.revision, journal,
      };
    };
    floor = read().revision;
  parentPort!.postMessage({ type: 'ready' });
  parentPort!.on('message', (request) => {
    let transaction = false;
    try {
      if (!Number.isSafeInteger(request.id) || request.id < 1 || request.key !== key) {
        throw new Error('Invalid control store request');
      }
      let record: ControlStorageRecord;
      if (request.operation === 'load') {
        record = read(); floor = record.revision;
      } else if (request.operation === 'cas') {
        const { expected } = request;
        if (!expected || expected.incarnation !== incarnation || !validRevision(expected.revision)
          || expected.revision === Number.MAX_SAFE_INTEGER) throw new Error('Invalid control store CAS');
        const journal = encodeControlStoreJournal(key, request.journal);
        database.exec('BEGIN IMMEDIATE'); transaction = true;
        const previous = read();
        floor = previous.revision;
        if (previous.revision !== expected.revision) {
          database.exec('ROLLBACK'); transaction = false;
          parentPort!.postMessage({ type: 'result', id: request.id, error: 'conflict' });
          return;
        }
        const before = previous.journal as Stream5000ControlJournal;
        const after = JSON.parse(journal) as Stream5000ControlJournal;
        if (after.nextClaimId < before.nextClaimId || (before.frontier && (!after.frontier
          || after.frontier.claimId < before.frontier.claimId
          || after.frontier.fieldRevision < before.frontier.fieldRevision))) {
          throw new Error('Control store history cannot move backwards');
        }
        const result = database.prepare('UPDATE control_record SET revision = revision + 1, journal = ? WHERE installation_key = ? AND incarnation = ? AND revision = ?')
          .run(journal, key, incarnation, expected.revision);
        if (result.changes !== 1) throw new Error('Control store conditional update failed');
        record = read();
        unchanged();
        database.exec('COMMIT'); transaction = false;
        floor = record.revision;
      } else throw new Error('Unsupported control store request');
      unchanged();
      parentPort!.postMessage({ type: 'result', id: request.id, record });
    } catch {
      if (transaction) {
        try {
          database.exec('ROLLBACK');
        } catch { /* Never interpret ambiguity as permission to retry. */ }
      }
      parentPort!.postMessage({ type: 'result', id: request.id, error: 'held' });
      try {
        database.close();
      } finally {
 parentPort!.close();
      }
    }
  });
  listening = true;
  } finally {
    if (!listening) database.close();
  }
}

if (!isMainThread && workerData?.type === 'stream5000-sqlite-control-store') {
  start().catch(() => {
    parentPort?.postMessage({ type: 'failed' });
    parentPort?.close();
  });
}

/** Homey write boundary: publish committed CT1 totals and preserve honest power availability. */
import { DualCtGridEnergySession } from './dualCtGridEnergySession';
import { dualCtHomeyEnergyKwh } from './dualCtEnergyCheckpoint';
import { DUAL_CT_ENERGY_RUNTIME_ENABLED } from './dualCtGridEnergySource';

interface DevicePort {
  setCapabilityValue: (id: string, value: number | null) => Promise<unknown>;
  setCapabilityOptions: (id: string, options: { approximation: boolean }) => Promise<unknown>;
  setEnergy: (energy: { cumulative: boolean; cumulativeImportedCapability: string; cumulativeExportedCapability: string }) => Promise<unknown>;
  setAvailable: () => Promise<unknown>;
  setUnavailable: (reason: string) => Promise<unknown>;
}

export class DualCtGridEnergyDeviceAdapter {
  private generation = 0;
  private active = false;
  private chain: Promise<void> = Promise.resolve();
  private status = 'not_started';
  private refreshPending: Promise<void> | null = null;
  private clearPending = false;
  private powerClear: Promise<void> | null = null;
  private powerClearRevision = 0;
  private publishedPower: { at: number; until: number } | null = null;

  private readonly session: DualCtGridEnergySession;
  private readonly port: DevicePort;
  private readonly runtimeEnabled: () => boolean;

  constructor(session: DualCtGridEnergySession, port: DevicePort,
    /** Code-owned injection for synthetic lifecycle verification; never a setting/request parameter. */
    runtimeEnabled: () => boolean = () => DUAL_CT_ENERGY_RUNTIME_ENABLED) {
    this.session = session; this.port = port; this.runtimeEnabled = runtimeEnabled;
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const pending = this.chain.catch(() => {}).then(work);
    this.chain = pending;
    return pending;
  }

  private current(generation: number): boolean {
    return generation === this.generation && this.active && this.runtimeEnabled() === true;
  }

  private async guard(generation: number): Promise<boolean> {
    if (this.current(generation)) {
      const view = this.session.view();
      if (view.candidateCapabilities['meter_power.imported'] !== null) return true;
      await this.fail(view.status); return false;
    }
    if (generation === this.generation && this.active) await this.fail('runtime_blocked');
    return false;
  }

  /** A slow SDK write must not keep an old projected power available past its own receipt deadline. */
  private checkPublishedPower(generation: number): void {
    if (!this.current(generation)) return;
    const view = this.session.view();
    if (this.clearPending || (this.publishedPower && (view.candidateCapabilities.measure_power === null
      || view.projectionNow < this.publishedPower.at || view.projectionNow >= this.publishedPower.until))) {
      this.requestPowerClear(generation).catch(() => {});
    }
  }

  private requestPowerClear(generation: number): Promise<void> {
    if (generation !== this.generation) return Promise.resolve();
    this.status = 'waiting_for_fresh_power';
    this.publishedPower = null;
    if (this.powerClear) return this.powerClear;
    ++this.powerClearRevision;
    const pending = (async () => {
      if (generation !== this.generation) return;
      this.clearPending = true;
      let unavailable = false;
      try {
        await this.port.setUnavailable('Waiting for fresh CT1 power'); unavailable = true;
      } catch { /* Retry on the next tick. */ }
      if (generation !== this.generation) return;
      try {
        await this.port.setCapabilityValue('measure_power', null); this.clearPending = !unavailable;
      } catch { /* Retain the retry flag. Never touch cumulative totals. */ }
    })().finally(() => {
      if (this.powerClear === pending) this.powerClear = null;
    });
    this.powerClear = pending; return pending;
  }

  /** Runtime withdrawal blocks before storage, configuration or capability writes. */
  start(): Promise<void> {
    const wasActive = this.active;
    const generation = ++this.generation;
    this.active = false; this.publishedPower = null;
    return this.enqueue(async () => {
      if (generation !== this.generation) return;
      try {
        await this.powerClear;
        if (generation !== this.generation) return;
        if (wasActive) {
          await this.session.close();
          await this.port.setUnavailable('Restarting CT1 meter readings');
          await this.port.setCapabilityValue('measure_power', null);
          if (generation !== this.generation) return;
        }
        if (!this.runtimeEnabled()) {
          this.status = 'runtime_blocked'; return;
        }
        await this.session.start();
        if (generation !== this.generation) return;
        const view = this.session.view();
        if (view.candidateCapabilities['meter_power.imported'] === null) {
          this.status = view.status; return;
        }
        this.active = true;
        // Fail unavailable through configuration/partial SDK writes. Never publish an old persisted watt value.
        await this.port.setUnavailable('Waiting for fresh CT1 power');
        if (!await this.guard(generation)) return;
        await this.port.setCapabilityValue('measure_power', null); this.clearPending = false;
        if (!await this.guard(generation)) return;
        await this.port.setCapabilityOptions('measure_power', view.proposedCapabilityOptions.measure_power);
        if (!await this.guard(generation)) return;
        await this.port.setEnergy({ ...view.proposedEnergyConfiguration });
        if (!await this.guard(generation)) return;
        await this.project(generation);
      } catch {
        await this.fail('projection_failed');
      }
    });
  }

  /** Feed from the existing owned subscription; opens no network connection itself. */
  observe(payload: Buffer, topic: string, receivedAt: number, measuredAt: number | null = null): Promise<void> {
    const { generation } = this;
    if (!this.current(generation)) return this.refresh();
    // Session owns/copies bounded bytes synchronously and enforces its eight-packet limit.
    const applied = this.session.observe(payload, topic, receivedAt, measuredAt);
    return applied.then(() => this.refresh());
  }

  /** Local expiry/catch-up tick; never requests or replays telemetry. */
  refresh(): Promise<void> {
    // This check deliberately runs outside the serialized projection queue.
    this.checkPublishedPower(this.generation);
    if (this.refreshPending) return this.refreshPending;
    const { generation } = this;
    this.refreshPending = this.enqueue(async () => {
      if (generation !== this.generation) return;
      if (!this.active) {
        if (this.clearPending) await this.clearPower(this.status);
        return;
      }
      try {
        await this.project(generation);
      } catch {
        await this.fail('projection_failed');
      }
    }).finally(() => {
      this.refreshPending = null;
    });
    return this.refreshPending;
  }

  /* eslint-disable no-await-in-loop -- Ordered SDK writes/guards inside a bounded catch-up loop. */
  private async project(generation: number): Promise<void> {
    // Bound catch-up work; continuous traffic cannot create an unbounded SDK loop.
    // Measurement/checkpoint commits remain independent of this UI queue.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!await this.guard(generation)) return;
      await this.powerClear;
      if (!await this.guard(generation)) return;
      const view = this.session.view();
      const values = view.candidateCapabilities;
      if (values['meter_power.imported'] === null || values['meter_power.exported'] === null) {
        await this.fail(view.status); return;
      }
      if (values.measure_power === null || this.clearPending) {
        await this.requestPowerClear(generation);
        if (!await this.guard(generation) || this.clearPending) return;
      }
      let superseded = false;
      let powerWriteClearRevision = -1;
      for (const id of ['meter_power.imported', 'meter_power.exported', 'measure_power'] as const) {
        if (!await this.guard(generation)) return;
        this.checkPublishedPower(generation); await this.powerClear;
        if (!await this.guard(generation) || this.clearPending) return;
        const fresh = this.session.view();
        if (JSON.stringify(fresh.candidateCapabilities) !== JSON.stringify(values)) {
          superseded = true; break;
        }
        // Null/stale power was already cleared with an unavailable status above.
        if (id === 'measure_power' && values[id] === null) continue;
        if (id === 'measure_power') powerWriteClearRevision = this.powerClearRevision;
        await this.port.setCapabilityValue(id, id === 'measure_power' ? values[id] : dualCtHomeyEnergyKwh(values[id]! * 1000));
      }
      if (!await this.guard(generation)) return;
      this.checkPublishedPower(generation); await this.powerClear;
      if (!await this.guard(generation) || this.clearPending) return;
      const after = this.session.view();
      if (superseded || JSON.stringify(after.candidateCapabilities) !== JSON.stringify(values)) continue;
      // An urgent clear may have landed after a slow power write. Republish before availability.
      if (values.measure_power !== null && powerWriteClearRevision !== this.powerClearRevision) continue;
      if (values.measure_power === null || after.powerFreshUntil === null) {
        this.status = 'waiting_for_fresh_power'; return;
      }
      this.publishedPower = { at: after.projectionNow, until: after.powerFreshUntil };
      this.status = 'recent';
      await this.port.setAvailable();
      if (!await this.guard(generation)) return;
      this.checkPublishedPower(generation); await this.powerClear;
      if (!await this.guard(generation) || this.clearPending) return;
      if (this.session.view().candidateCapabilities.measure_power === null || !this.publishedPower) {
        await this.requestPowerClear(generation);
        this.status = 'waiting_for_fresh_power'; return;
      }
      return;
    }
    // Keep the last still-fresh committed projection, rather than blanking healthy power.
    // The next normal tick catches up; the independent deadline check still expires it.
    this.status = 'projection_superseded'; this.checkPublishedPower(generation); await this.powerClear;
  }

  /* eslint-enable no-await-in-loop */

  private async fail(reason: string): Promise<void> {
    this.active = false; this.publishedPower = null; this.status = reason;
    await this.powerClear;
    await this.session.close();
    await this.clearPower(reason);
    // Retain committed cumulative totals; never reset/migrate another device or clear its checkpoint.
  }

  private async clearPower(reason: string): Promise<void> {
    this.clearPending = true;
    let unavailable = false;
    try {
      await this.port.setUnavailable(reason); unavailable = true;
    } catch { /* Retry on a later local tick. */ }
    try {
      await this.port.setCapabilityValue('measure_power', null); this.clearPending = !unavailable;
    } catch { /* Do not lose a failed clear. */ }
  }

  close(): Promise<void> {
    const wasActive = this.active;
    ++this.generation; this.active = false; this.publishedPower = null; this.status = 'closed';
    const closed = this.session.close();
    return this.enqueue(async () => {
      await closed; await this.powerClear;
      if (wasActive || this.clearPending) await this.clearPower('closed');
    });
  }

  diagnostics() {
    return {
      status: this.status, active: this.active, valuesIncluded: false, controlsEnabled: false,
    };
  }
}

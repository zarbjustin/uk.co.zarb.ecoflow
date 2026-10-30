/** Homey write boundary for a FUTURE separate Energy device. Not instantiated by any driver. */
import { DualCtGridEnergySession } from './dualCtGridEnergySession';
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

  /** Production default is blocked before storage, subscriptions, configuration or capability writes. */
  start(): Promise<void> {
    const wasActive = this.active;
    const generation = ++this.generation;
    this.active = false;
    return this.enqueue(async () => {
      if (generation !== this.generation) return;
      try {
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
        await this.port.setCapabilityValue('measure_power', null);
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

  /** Called by a future driver from its existing owned subscription; opens no network connection itself. */
  observe(payload: Buffer, topic: string, receivedAt: number, measuredAt: number | null = null): Promise<void> {
    const { generation } = this;
    if (!this.current(generation)) return this.refresh();
    // Session owns/copies bounded bytes synchronously and enforces its eight-packet limit.
    const applied = this.session.observe(payload, topic, receivedAt, measuredAt);
    return applied.then(() => this.refresh());
  }

  /** Future driver's local expiry timer calls this; it never requests or replays telemetry. */
  refresh(): Promise<void> {
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

  private async project(generation: number): Promise<void> {
    if (generation !== this.generation || !this.active) return;
    if (!this.current(generation)) {
      await this.fail('runtime_blocked'); return;
    }
    const view = this.session.view();
    const values = view.candidateCapabilities;
    if (values['meter_power.imported'] === null || values['meter_power.exported'] === null) {
      await this.fail(view.status); return;
    }
    await this.port.setUnavailable('Updating CT1 readings');
    // Requalify after EVERY awaited write; consent/firmware/inventory can change while SDK IO is pending.
    for (const id of ['meter_power.imported', 'meter_power.exported', 'measure_power'] as const) {
      // eslint-disable-next-line no-await-in-loop
      if (!await this.guard(generation)) return;
      const fresh = this.session.view();
      if (fresh.candidateCapabilities['meter_power.imported'] === null) {
        await this.fail(fresh.status); return;
      }
      // Never combine two checkpoints if later observations have committed while SDK writes were pending.
      if (JSON.stringify(fresh.candidateCapabilities) !== JSON.stringify(values)) {
        await this.port.setCapabilityValue('measure_power', null);
        this.status = 'projection_superseded'; return;
      }
      // eslint-disable-next-line no-await-in-loop
      await this.port.setCapabilityValue(id, values[id]);
    }
    if (!await this.guard(generation)) return;
    const after = this.session.view();
    if (JSON.stringify(after.candidateCapabilities) !== JSON.stringify(values)) {
      await this.port.setCapabilityValue('measure_power', null);
      this.status = 'projection_superseded'; return;
    }
    this.status = values.measure_power === null ? 'waiting_for_fresh_power' : 'recent';
    if (values.measure_power !== null) await this.port.setAvailable();
    await this.guard(generation);
  }

  private async fail(reason: string): Promise<void> {
    this.active = false; this.status = reason;
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
    ++this.generation; this.active = false; this.status = 'closed';
    const closed = this.session.close();
    return this.enqueue(async () => {
      await closed;
      if (wasActive || this.clearPending) await this.clearPower('closed');
    });
  }

  diagnostics() {
    return {
      status: this.status, active: this.active, valuesIncluded: false, controlsEnabled: false,
    };
  }
}

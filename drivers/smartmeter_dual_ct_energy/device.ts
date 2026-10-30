import Homey from 'homey';
import { randomUUID } from 'crypto';
import { DualCtEnergyDetails } from '../../lib/dualCtEnergyDetails';
import { DUAL_CT_DISPLAY_SETTINGS } from '../../lib/dualCtDisplaySettings';
import { DualCtCommunityFeedback } from '../../lib/dualCtCommunityFeedback';
import { appAuthClientFromSettings, clearSavedAppAuthCreds } from '../../lib/appAuthPairing';
import { hasOtherAppAuthDevices } from '../../lib/appAuthConsumers';
import { DualCtHomeyEnergyContext, dualCtCredentialsRevision } from '../../lib/dualCtHomeyEnergyContext';
import { DualCtGridEnergySession } from '../../lib/dualCtGridEnergySession';
import { DualCtGridEnergyDeviceAdapter } from '../../lib/dualCtGridEnergyDeviceAdapter';
import { DualCtEnergyAuthority } from '../../lib/dualCtEnergyAdoption';
import { dualCtEnergyHomeyStorage, readDualCtEnergyCheckpoint, dualCtHomeyEnergyKwh } from '../../lib/dualCtEnergyCheckpoint';
import { DUAL_CT_ENERGY_RUNTIME_ENABLED, dualCtGridBinding, resolveDualCtGridEnergyContract } from '../../lib/dualCtGridEnergySource';
import { AppFrameDelivery } from '../../lib/EcoFlowAppMqtt';
import { DualCtLiveDelivery } from '../../lib/dualCtLiveDelivery';

// Shared by every instance in this app process; never one authority per device.
const authority = new DualCtEnergyAuthority();

module.exports = class DualCtEnergyDevice extends Homey.Device {
  private readonly communityFeedback = new DualCtCommunityFeedback();
  private readonly details = new DualCtEnergyDetails(this);
  private generation = 0;
  private context: DualCtHomeyEnergyContext | null = null;
  private adapter: DualCtGridEnergyDeviceAdapter | null = null;
  private handler: ((payload: Buffer, topic: string) => void) | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 30000;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private identityRefresh: Promise<void> | null = null;
  private lastRefresh = 0;
  private credentialRevision = '';
  private readonly accountChanged = (key: string) => {
    if (['appAuthEmail', 'appAuthPassword', 'appAuthHost'].includes(key)) this.stop().catch(() => {});
  };

  /** Internal seams for synthetic lifecycle tests. No runtime setting can qualify a source or enable accounting. */
  protected energyDependencies() {
    return {
      enabled: () => DUAL_CT_ENERGY_RUNTIME_ENABLED,
      resolve: resolveDualCtGridEnergyContract,
      context: () => new DualCtHomeyEnergyContext({
        homey: this.homey,
        sn: this.getData().sn,
        ownDevice: { sn: this.getData().sn, driverId: 'homey:app:uk.co.zarb.ecoflow:smartmeter_dual_ct_energy' },
        client: () => appAuthClientFromSettings(this.homey),
        communityThreePhase: this.getStoreValue('dualCtEnergyMode') === 'three_phase_community',
      }),
    };
  }

  async onInit(): Promise<void> {
    this.homey.settings.on('set', this.accountChanged);
    this.homey.settings.on('unset', this.accountChanged);
    await this.connect();
    // Optional capability/UI setup must never delay the core Energy subscription.
    if (this.getStoreValue('dualCtEnergyConsent') === 1) await this.configureDetails().catch(() => {});
  }

  private async connect(): Promise<void> {
    const clearing = this.stop();
    const { generation } = this;
    await clearing;
    if (generation !== this.generation) return;
    const dependencies = this.energyDependencies();
    if (!dependencies.enabled() || this.getStoreValue('dualCtEnergyConsent') !== 1) return;
    this.credentialRevision = dualCtCredentialsRevision(this.homey);
    const context = dependencies.context(); this.context = context;
    try {
      await context.refresh();
      if (generation !== this.generation) return;
      const snapshot = context.snapshot();
      if (!snapshot) throw new Error('source');
      const { source } = snapshot;
      const resolve = (identity: typeof source.identity) => (context.isCommunityTrial?.() === true ? context.resolveContract(identity) : dependencies.resolve(identity));
      const contract = resolve(source.identity);
      const scope = {
        account: source.account, device: source.device, grid: source.grid, session: randomUUID(),
      };
      const binding = contract && dualCtGridBinding(scope, contract);
      if (!binding || binding !== this.getStoreValue('dualCtEnergySourceBinding')
        || source.account !== this.getStoreValue('dualCtEnergyAccountBinding') || source.grid !== this.getStoreValue('dualCtEnergyGrid')) throw new Error('binding');
      const storage = dualCtEnergyHomeyStorage(this);
      const { read } = storage;
      storage.read = async () => {
        const saved = await read();
        const checkpoint = readDualCtEnergyCheckpoint(saved, binding, contract!.timing);
        for (const [capability, wh] of [['meter_power.imported', checkpoint?.importedWh], ['meter_power.exported', checkpoint?.exportedWh]] as const) {
          const previous = this.getCapabilityValue(capability);
          if (previous !== null && previous !== undefined && (typeof previous !== 'number' || !Number.isFinite(previous) || previous < 0)) throw new Error('counter_invalid');
          if (typeof previous === 'number' && previous > 0 && (wh === undefined || previous > dualCtHomeyEnergyKwh(wh) + 1e-9)) throw new Error('counter_rollback');
        }
        return saved;
      };
      const session = new DualCtGridEnergySession({
        scope,
        identity: source.identity,
        readIdentity: () => context.snapshot()?.source.identity || { productType: -1, firmware: '' },
        storage,
        authority,
        resolveContract: resolve,
        observeEvidence: this.getStoreValue('dualCtEnergyMode') === 'three_phase_community'
          ? (status, ms) => this.communityFeedback.record(status, ms) : undefined,
        review: () => ({
          explicitConsent: generation === this.generation && this.getStoreValue('dualCtEnergyConsent') === 1
          && this.credentialRevision === dualCtCredentialsRevision(this.homey),
          target: 'new_energy_device',
          accounting: 'power',
          binding,
          grid: scope.grid,
          inventoryComplete: context.snapshot()?.inventory.complete === true,
          contributors: context.snapshot()?.inventory.contributors || [],
          externalOverlapReviewed: true,
          contractQualified: true,
        }),
      });
      const adapter = new DualCtGridEnergyDeviceAdapter(session, this, dependencies.enabled); this.adapter = adapter;
      await adapter.start();
      if (generation !== this.generation) {
        await adapter.close(); return;
      }
      if (!adapter.diagnostics().active) throw new Error('blocked');
      this.details.start(scope);
      const deliveryGuard = new DualCtLiveDelivery();
      const handler = (payload: Buffer, topic: string, delivery?: Readonly<AppFrameDelivery>) => {
        if (generation === this.generation && this.handler === handler) {
          this.details.observe(payload, topic, delivery, Date.now());
          const result = deliveryGuard.inspect(payload, topic, `/app/device/property/${source.device}`, delivery, Date.now());
          if (this.getStoreValue('dualCtEnergyMode') === 'three_phase_community' && !result.accepted) this.communityFeedback.record('delivery_rejected');
          if (result.restartAnchor) {
            this.recover(generation, dependencies.enabled).catch(() => {}); return;
          }
          if (!result.accepted || !delivery) return;
          adapter.observe(payload, topic, delivery.receivedAt).catch(() => this.recover(generation, dependencies.enabled).catch(() => {}));
        }
      };
      this.handler = handler;
      const app = this.homey.app as any;
      const subscribed = await app.subscribeAppRealtime(source.device, handler, () => generation === this.generation && dependencies.enabled());
      if (generation !== this.generation) {
        app.unsubscribeAppRealtime(source.device, handler); return;
      }
      if (!subscribed) throw new Error('subscription');
      this.retryDelay = 30000;
      this.lastRefresh = Date.now();
      this.ticker = this.homey.setInterval(() => {
        if (generation !== this.generation || this.adapter !== adapter) return;
        this.details.render().catch(() => {});
        adapter.refresh().then(() => {
          if (generation === this.generation && !adapter.diagnostics().active) this.recover(generation, dependencies.enabled).catch(() => {});
        }).catch(() => this.recover(generation, dependencies.enabled).catch(() => {}));
        // Local expiry never waits for a network inventory/identity refresh.
        if (Date.now() - this.lastRefresh >= 60000 && !this.identityRefresh) {
          this.lastRefresh = Date.now();
          const refresh = context.refresh().then(() => (generation === this.generation ? adapter.refresh() : undefined)).catch(() => this.recover(generation, dependencies.enabled))
            .finally(() => {
              if (this.identityRefresh === refresh) this.identityRefresh = null;
            });
          this.identityRefresh = refresh;
        }
      }, 1000);
    } catch {
      await this.recover(generation, dependencies.enabled);
    }
  }

  private async recover(generation: number, enabled: () => boolean): Promise<void> {
    if (generation !== this.generation) return;
    if (this.getStoreValue('dualCtEnergyMode') === 'three_phase_community') this.communityFeedback.record('recovery');
    const clearing = this.stop(); const stoppedGeneration = this.generation;
    await clearing;
    if (stoppedGeneration !== this.generation || !enabled() || this.getStoreValue('dualCtEnergyConsent') !== 1) return;
    this.retry = this.homey.setTimeout(() => {
      this.retry = null; this.connect().catch(() => {});
    }, this.retryDelay);
    this.retryDelay = Math.min(300000, this.retryDelay * 2);
  }

  private async stop(): Promise<void> {
    const generation = ++this.generation;
    if (this.retry) this.homey.clearTimeout(this.retry);
    this.retry = null;
    if (this.ticker) this.homey.clearInterval(this.ticker);
    this.ticker = null;
    if (this.handler) (this.homey.app as any).unsubscribeAppRealtime(this.getData().sn, this.handler);
    this.handler = null; this.context?.close(); this.context = null;
    const { adapter } = this; this.adapter = null;
    await Promise.all([adapter?.close(), this.details.stop()]);
    if (generation !== this.generation) return;
    await this.setUnavailable(this.homey.__(this.getStoreValue('dualCtEnergyConsent') === 1
      ? 'dual_ct_energy.recovering' : 'dual_ct_energy.unavailable')).catch(() => {});
    if (generation !== this.generation) return;
    await this.setCapabilityValue('measure_power', null).catch(() => {});
    // Retain cumulative totals/checkpoints, paired identity, Insights and other devices.
  }

  private configureDetails(settings = { display_ct1: this.getSetting('display_ct1'), display_ct2: this.getSetting('display_ct2') }) {
    return this.details.configure(settings, this.getStoreValue('dualCtEnergyMode') === 'three_phase_community');
  }

  async onSettings({ newSettings, changedKeys }: { newSettings: any; changedKeys: string[] }): Promise<void> {
    if (changedKeys.some((key) => DUAL_CT_DISPLAY_SETTINGS.includes(key))) await this.configureDetails(newSettings);
  }

  getDualCtCommunityFeedback() {
    return this.getStoreValue('dualCtEnergyMode') === 'three_phase_community' ? this.communityFeedback.snapshot() : null;
  }

  async resumeAppAccountAfterRepair(): Promise<void> {
    await this.connect();
  }

  async onUninit(): Promise<void> {
    this.homey.settings.removeListener('set', this.accountChanged);
    this.homey.settings.removeListener('unset', this.accountChanged);
    await this.stop();
  }

  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- finish checkpoint IO before clearing shared credentials.
  async onDeleted(): Promise<void> {
    await this.onUninit();
    if (!hasOtherAppAuthDevices(this.homey, this)) clearSavedAppAuthCreds(this.homey);
  }
};

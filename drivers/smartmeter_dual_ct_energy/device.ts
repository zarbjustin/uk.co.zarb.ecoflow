import Homey from 'homey';
import { randomUUID } from 'crypto';
import { dualCtEnergyRecoverySnapshot } from '../../lib/dualCtRecoveryDiagnostics';
import { DualCtMessageEvidence } from '../../lib/dualCtMessageEvidence';
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
import { DualCtCt2FlowInput } from '../../lib/dualCtCt2FlowInput';
import {
  QualifiedGridNotifications, SustainedGridObservation, gridNotificationObservationMatches,
} from '../../lib/sustainedGridNotifications';

// Shared by every instance in this app process; never one authority per device.
const authority = new DualCtEnergyAuthority();
type FlowChannel = 'ct1' | 'ct2';

module.exports = class DualCtEnergyDevice extends Homey.Device {
  private startupFailure: { startupStage: string; context: unknown; admission: string | null } = { startupStage: 'idle', context: null, admission: null };
  private readonly messageEvidence = new DualCtMessageEvidence();
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
  private gridNotificationAnchorRevision = 0;
  private gridNotificationAnchorPending = false;
  private gridNotificationCard: any = null;
  private readonly reloadGridNotifications = () => this.gridNotifications.reload();
  private readonly gridNotifications = new QualifiedGridNotifications({
    loadRules: () => this.gridNotificationCard?.getArgumentValues(this) ?? Promise.resolve([]),
    readCurrent: () => {
      const now = Date.now();
      return { observation: this.currentGridNotificationObservation(now), now };
    },
    trigger: (tokens, state) => this.gridNotificationCard?.trigger(this, tokens, state) ?? Promise.resolve(),
    onError: () => (this as any).error?.('Grid notification arguments or delivery unavailable'),
  });

  private readonly ct2FlowInput = new DualCtCt2FlowInput();
  private ct1BelowDelivery?: Readonly<AppFrameDelivery>;
  private ct2SourceCurrent: (() => boolean) | null = null;
  private belowNotificationCard: any = null;
  private readonly belowNotifications = { ct1: this.makeBelowNotifications('ct1'), ct2: this.makeBelowNotifications('ct2') };
  private readonly reloadBelowNotifications = () => Object.values(this.belowNotifications).forEach((observer) => observer.reload());

  private makeBelowNotifications(channel: FlowChannel): QualifiedGridNotifications {
    return new QualifiedGridNotifications({
      loadRules: async () => {
        const rules = await (this.belowNotificationCard?.getArgumentValues(this) ?? []);
        if (!Array.isArray(rules) || rules.length > 256) throw Error('Invalid Dual CT notification rules');
        return rules.filter((rule) => rule?.channel === channel);
      },
      readCurrent: () => {
        const now = Date.now();
        return { observation: this.currentBelowObservation(channel, now), now };
      },
      trigger: (tokens, state) => this.belowNotificationCard?.trigger(this, { ...tokens, channel: channel.toUpperCase() }, { ...state, channel }) ?? Promise.resolve(),
      onError: () => (this as any).error?.('Dual CT below notification unavailable'),
    }, true);
  }

  private ct2FlowConfiguration(): string | null {
    const phases = this.getSetting('display_ct2');
    const sign = this.getSetting('ct2_flow_import_sign');
    return (phases === 'single_phase' || phases === 'three_phase') && (sign === 'positive' || sign === 'negative')
      ? `${phases}:${sign}` : null;
  }

  private currentBelowObservation(channel: FlowChannel, now: number): SustainedGridObservation | null {
    if (channel === 'ct1') {
      const observation = this.currentGridNotificationObservation(now);
      const delivery = this.ct1BelowDelivery;
      return observation && delivery?.receivedAt === observation.receivedAt && delivery.isCurrent?.() ? observation : null;
    }
    try {
      const configuration = this.ct2FlowConfiguration();
      return configuration && this.ct2SourceCurrent?.() ? this.ct2FlowInput.current(configuration, now) : null;
    } catch {
      return null;
    }
  }

  belowNotificationEventCurrent(channel: unknown, observation: SustainedGridObservation | null): boolean {
    if (channel !== 'ct1' && channel !== 'ct2') return false;
    const now = Date.now();
    return gridNotificationObservationMatches(observation, this.currentBelowObservation(channel, now), now);
  }

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

  gridPowerAbove(direction: string, watts: number): boolean {
    if (!['import', 'export'].includes(direction) || typeof watts !== 'number' || !Number.isFinite(watts)
      || watts < 0 || watts > 100000) throw new Error('Invalid grid power comparison');
    if (!this.handler || !this.adapter || this.getStoreValue('dualCtEnergyConsent') !== 1
      || this.credentialRevision !== dualCtCredentialsRevision(this.homey)) throw new Error('Fresh qualified CT1 power is unavailable');
    const power = this.adapter.currentPower();
    if (this.getCapabilityValue('measure_power') !== power) throw new Error('Current CT1 display is unavailable');
    return (direction === 'export' ? -power : power) > watts;
  }

  private currentGridNotificationObservation(now: number) {
    try {
      if (this.gridNotificationAnchorPending || !this.handler || !this.adapter || this.getStoreValue('dualCtEnergyConsent') !== 1
        || this.credentialRevision !== dualCtCredentialsRevision(this.homey)) return null;
      const observation = this.adapter.currentPowerObservation(now);
      return observation && this.getCapabilityValue('measure_power') === observation.powerW ? observation : null;
    } catch {
      return null;
    }
  }

  gridNotificationEventCurrent(observation: SustainedGridObservation | null): boolean {
    const now = Date.now();
    return gridNotificationObservationMatches(observation, this.currentGridNotificationObservation(now), now);
  }

  private tickGridNotifications(observation: SustainedGridObservation | null, now: number): void {
    try {
      this.gridNotifications.tick(observation, now);
    } catch {
      // Monitoring failure must not block core expiry, restart or shutdown.
    }
    this.tickBelowNotifications('ct1', observation ? this.currentBelowObservation('ct1', now) : null, now);
  }

  private tickBelowNotifications(channel: FlowChannel, observation: SustainedGridObservation | null, now: number): void {
    try {
      this.belowNotifications[channel].tick(observation, now);
    } catch {
      // Notification errors are isolated from meter readings and accounting.
    }
  }

  async onInit(): Promise<void> {
    this.homey.settings.on('set', this.accountChanged);
    this.homey.settings.on('unset', this.accountChanged);
    if (!this.gridNotificationCard) {
      this.gridNotificationCard = this.homey.flow?.getDeviceTriggerCard('smartmeter_grid_power_sustained') ?? null;
      this.gridNotificationCard?.on('update', this.reloadGridNotifications);
    }
    this.gridNotifications.start();
    if (!this.belowNotificationCard) {
      this.belowNotificationCard = this.homey.flow?.getDeviceTriggerCard('smartmeter_dual_ct_power_below_sustained') ?? null;
      this.belowNotificationCard?.on('update', this.reloadBelowNotifications);
    }
    Object.values(this.belowNotifications).forEach((observer) => observer.start());
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
    let startupStage = 'source';
    try {
      await context.refresh();
      if (generation !== this.generation) return;
      const snapshot = context.snapshot();
      if (!snapshot) throw new Error('source');
      const { source } = snapshot;
      const resolve = (identity: typeof source.identity) => (context.isCommunityTrial?.() === true ? context.resolveContract(identity) : dependencies.resolve(identity));
      startupStage = 'contract';
      const contract = resolve(source.identity);
      if (!contract) throw new Error('contract');
      const scope = {
        account: source.account, device: source.device, grid: source.grid, session: randomUUID(),
      };
      startupStage = 'binding';
      const binding = dualCtGridBinding(scope, contract);
      if (!binding || binding !== this.getStoreValue('dualCtEnergySourceBinding')
        || source.account !== this.getStoreValue('dualCtEnergyAccountBinding') || source.grid !== this.getStoreValue('dualCtEnergyGrid')) throw new Error('binding');
      startupStage = 'admission';
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
      const adapter = new DualCtGridEnergyDeviceAdapter(session, this, dependencies.enabled, (observation) => {
        if (generation !== this.generation || this.adapter !== adapter) return;
        const now = Date.now();
        this.tickGridNotifications(observation && gridNotificationObservationMatches(
          observation, this.currentGridNotificationObservation(now), now,
        ) ? observation : null, now);
      });
      this.adapter = adapter;
      await adapter.start();
      if (generation !== this.generation) {
        await adapter.close(); return;
      }
      if (!adapter.diagnostics().active) throw new Error('blocked');
      this.details.start(scope);
      this.ct2SourceCurrent = () => {
        if (generation !== this.generation || !this.handler || !dependencies.enabled() || !adapter.diagnostics().active
          || this.getStoreValue('dualCtEnergyConsent') !== 1
          || this.getStoreValue('dualCtEnergySourceBinding') !== binding
          || this.credentialRevision !== dualCtCredentialsRevision(this.homey)) return false;
        const current = context.snapshot();
        return current?.inventory.complete === true && current.source.account === source.account
          && current.source.device === source.device && current.source.grid === source.grid
          && current.source.identity.productType === source.identity.productType
          && current.source.identity.firmware === source.identity.firmware;
      };
      const deliveryGuard = new DualCtLiveDelivery();
      const handler = (payload: Buffer, topic: string, delivery?: Readonly<AppFrameDelivery>) => {
        if (generation === this.generation && this.handler === handler) {
          const now = Date.now();
          try {
            const configuration = this.ct2FlowConfiguration();
            if (configuration && this.ct2SourceCurrent?.()) {
              this.ct2FlowInput.observe(source.device, contract.encoding, configuration, payload, topic, delivery, now);
              this.tickBelowNotifications('ct2', this.ct2FlowInput.current(configuration, now), now);
            } else if (configuration) {
              this.ct2FlowInput.reset();
              this.tickBelowNotifications('ct2', null, now);
            }
          } catch {
            this.ct2FlowInput.reset();
            this.tickBelowNotifications('ct2', null, now);
          }
          this.details.observe(payload, topic, delivery, Date.now());
          const result = deliveryGuard.inspect(payload, topic, `/app/device/property/${source.device}`, delivery, Date.now());
          let topicKind = 'other';
          if (topic === `/app/device/property/${source.device}`) topicKind = 'property';
          else if (topic.endsWith(`/${source.device}/thing/property/get_reply`)) topicKind = 'get_reply';
          this.messageEvidence.record(payload, topicKind,
            result.accepted ? 'delivery_eligible' : result.status);
          if (this.getStoreValue('dualCtEnergyMode') === 'three_phase_community' && !result.accepted) {
            this.communityFeedback.record('delivery_rejected'); this.communityFeedback.record(result.status);
          }
          if (result.restartAnchor) {
            this.ct1BelowDelivery = undefined;
            const anchorRevision = ++this.gridNotificationAnchorRevision;
            this.gridNotificationAnchorPending = true;
            this.tickGridNotifications(null, Date.now());
            session.resetAnchor().then(() => {
              if (generation !== this.generation || this.adapter !== adapter) return undefined;
              if (anchorRevision === this.gridNotificationAnchorRevision) this.gridNotificationAnchorPending = false;
              return adapter.refresh();
            }).catch(() => this.recover(generation, dependencies.enabled).catch(() => {})); return;
          }
          if (!result.accepted || !delivery) return;
          this.ct1BelowDelivery = delivery;
          adapter.observe(payload, topic, delivery.receivedAt).catch(() => this.recover(generation, dependencies.enabled).catch(() => {}));
        }
      };
      this.handler = handler;
      const app = this.homey.app as any;
      startupStage = 'subscription';
      const subscribed = await app.subscribeAppRealtime(source.device, handler, () => generation === this.generation && dependencies.enabled());
      if (generation !== this.generation) {
        app.unsubscribeAppRealtime(source.device, handler); return;
      }
      if (!subscribed) throw new Error('subscription');
      this.retryDelay = 30000;
      this.lastRefresh = Date.now();
      this.startupFailure = { startupStage: 'ready', context: null, admission: null };
      this.ticker = this.homey.setInterval(() => {
        if (generation !== this.generation || this.adapter !== adapter) return;
        const now = Date.now();
        this.tickGridNotifications(this.currentGridNotificationObservation(now), now);
        this.tickBelowNotifications('ct2', this.currentBelowObservation('ct2', now), now);
        this.details.render().catch(() => {});
        adapter.refresh().then(() => {
          if (generation === this.generation && !adapter.diagnostics().active) this.recover(generation, dependencies.enabled).catch(() => {});
        }).catch(() => this.recover(generation, dependencies.enabled).catch(() => {}));
        // Local expiry never waits for a network inventory/identity refresh.
        if (Date.now() - this.lastRefresh >= 60000 && !this.identityRefresh) {
          this.lastRefresh = Date.now();
          const refresh = context.refresh().then(() => (generation === this.generation ? adapter.refresh() : undefined)).catch(() => {
            if (generation === this.generation) {
              this.startupFailure = { startupStage: 'source', context: context.diagnostics?.() || null, admission: adapter.diagnostics().status };
              this.communityFeedback.record('identity_refresh_failed');
            }
            return this.recover(generation, dependencies.enabled);
          })
            .finally(() => {
              if (this.identityRefresh === refresh) this.identityRefresh = null;
            });
          this.identityRefresh = refresh;
        }
      }, 1000);
    } catch {
      if (generation === this.generation) {
        this.startupFailure = { startupStage, context: context.diagnostics?.() || null, admission: this.adapter?.diagnostics().status || null };
        this.communityFeedback.record(`startup_${startupStage}_failed`);
      }
      await this.recover(generation, dependencies.enabled);
    }
  }

  private async recover(generation: number, enabled: () => boolean): Promise<void> {
    if (generation !== this.generation) return;
    if (this.getStoreValue('dualCtEnergyMode') === 'three_phase_community') this.communityFeedback.record('recovery');
    const clearing = this.stop(); const stoppedGeneration = this.generation;
    await clearing;
    if (stoppedGeneration !== this.generation || !enabled() || this.getStoreValue('dualCtEnergyConsent') !== 1) return;
    if (this.getDualCtEnergyDiagnostics()?.context?.reason === 'energy_role_review_required') {
      await this.setUnavailable(this.homey.__('dual_ct_energy.reviewRoleRequired')).catch(() => {});
      if (stoppedGeneration !== this.generation) return;
    }
    this.retry = this.homey.setTimeout(() => {
      this.retry = null; this.connect().catch(() => {});
    }, this.retryDelay);
    this.retryDelay = Math.min(300000, this.retryDelay * 2);
  }

  private async stop(): Promise<void> {
    const generation = ++this.generation;
    ++this.gridNotificationAnchorRevision;
    this.gridNotificationAnchorPending = false;
    this.tickGridNotifications(null, Date.now());
    this.ct1BelowDelivery = undefined;
    this.ct2SourceCurrent = null;
    this.ct2FlowInput.reset();
    this.tickBelowNotifications('ct2', null, Date.now());
    if (this.retry) this.homey.clearTimeout(this.retry);
    this.retry = null;
    if (this.ticker) this.homey.clearInterval(this.ticker);
    this.ticker = null;
    if (this.handler) (this.homey.app as any).unsubscribeAppRealtime(this.getData().sn, this.handler);
    this.handler = null; this.context?.close(); this.context = null;
    const { adapter } = this; this.adapter = null;
    this.details.stop().catch(() => {});
    await adapter?.close();
    if (generation !== this.generation) return;
    // The adapter owns bounded availability/power invalidation when present.
    // Optional rendering and SDK shutdown writes do not own counter authority.
    if (adapter) return;
    await this.setUnavailable(this.homey.__(this.getStoreValue('dualCtEnergyConsent') === 1
      ? 'dual_ct_energy.recovering' : 'dual_ct_energy.unavailable')).catch(() => {});
    if (generation !== this.generation) return;
    await this.setCapabilityValue('measure_power', null).catch(() => {});
    // Retain cumulative totals/checkpoints, paired identity, Insights and other devices.
  }

  private async configureDetails(settings = { display_ct1: this.getSetting('display_ct1'), display_ct2: this.getSetting('display_ct2') }) {
    let mode = 'pairedDisabled';
    if (this.getStoreValue('dualCtEnergyConsent') === 1) {
      mode = this.getStoreValue('dualCtEnergyMode') === 'three_phase_community' ? 'pairedThreePhase' : 'pairedSinglePhase';
    }
    // Presentation only: never use the label as accounting authority. Failure must not block details.
    await this.setSettings({ paired_mode_summary: this.homey.__(`dual_ct_energy.${mode}`) }).catch(() => {});
    return this.details.configure(settings, this.getStoreValue('dualCtEnergyMode') === 'three_phase_community');
  }

  async onSettings({ newSettings, changedKeys }: { newSettings: any; changedKeys: string[] }): Promise<void> {
    if (changedKeys.includes('display_ct2') || changedKeys.includes('ct2_flow_import_sign')) {
      this.ct2FlowInput.reset();
      this.tickBelowNotifications('ct2', null, Date.now());
    }
    if (changedKeys.some((key) => DUAL_CT_DISPLAY_SETTINGS.includes(key))) await this.configureDetails(newSettings);
  }

  getDualCtEnergyDiagnostics() {
    return dualCtEnergyRecoverySnapshot({
      ...this.startupFailure,
      mode: this.getStoreValue('dualCtEnergyMode') === 'three_phase_community' ? 'three_phase_community' : 'single_phase',
      retryScheduled: this.retry !== null,
      active: this.adapter?.diagnostics().active === true,
    });
  }

  getDualCtCommunityFeedback() {
    if (this.getStoreValue('dualCtEnergyMode') !== 'three_phase_community') return null;
    return {
      ...this.communityFeedback.snapshot(),
      messageEvidence: this.messageEvidence.snapshot(),
      retryScheduled: this.retry !== null,
      transport: (this.homey.app as any).getAppRealtimeDiagnostics?.(this.getData().sn) || null,
    };
  }

  async resumeAppAccountAfterRepair(): Promise<void> {
    await this.connect();
  }

  async onUninit(): Promise<void> {
    this.gridNotifications.stop();
    this.gridNotificationCard?.removeListener('update', this.reloadGridNotifications);
    this.gridNotificationCard = null;
    Object.values(this.belowNotifications).forEach((observer) => observer.stop());
    this.belowNotificationCard?.removeListener('update', this.reloadBelowNotifications);
    this.belowNotificationCard = null;
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

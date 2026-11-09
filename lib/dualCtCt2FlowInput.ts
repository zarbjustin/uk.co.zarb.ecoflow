import type { AppFrameDelivery } from './EcoFlowAppMqtt';
import { DUAL_CT_BANK_DEFINITIONS } from './dualCtContract';
import { decodeDualCtCandidates } from './dualCtDecoder';
import { dualCtEncodingPolicy, DualCtEncodingBasis } from './dualCtEncoding';
import { DUAL_CT_LIVE_INTERVAL_MS, DualCtLiveDelivery } from './dualCtLiveDelivery';
import { decodeFrameHeaders } from './streamAc5000Protocol';
import type { SustainedGridObservation } from './sustainedGridNotifications';

const bank = DUAL_CT_BANK_DEFINITIONS.find((row) => row.bank === 'B')!;
const newDelivery = () => new DualCtLiveDelivery([bank.total, ...bank.power]);

/** Experimental circuit notifications only. No Energy or display-cache inputs. */
export class DualCtCt2FlowInput {
  private delivery = newDelivery();
  private receipt?: Readonly<AppFrameDelivery>;
  private observation: SustainedGridObservation | null = null;
  private generation = 0;
  private configuration: string | null = null;

  reset(): void {
    this.delivery = newDelivery();
    this.observation = null;
    this.receipt = undefined;
    this.configuration = null;
    this.generation += 1;
  }

  current(configuration: string | null, now: number): SustainedGridObservation | null {
    const { observation } = this;
    return configuration !== null && configuration === this.configuration && this.receipt?.isCurrent?.() && observation
      && now >= observation.receivedAt && now < observation.validUntil ? observation : null;
  }

  observe(device: string, encoding: DualCtEncodingBasis, configuration: string, payload: Buffer,
    topic: string, receipt: Readonly<AppFrameDelivery> | undefined, now: number): void {
    if (configuration !== this.configuration) {
      this.reset();
      this.configuration = configuration;
    }
    const result = this.delivery.inspect(payload, topic, `/app/device/property/${device}`, receipt, now);
    if (result.restartAnchor || result.status === 'invalid_grid_payload' || result.status === 'invalid_header') {
      this.observation = null;
      this.generation += 1;
    }
    if (!result.accepted || !receipt?.isCurrent?.()) return;
    // A new incomplete or invalid bank withdraws the prior sample immediately.
    this.observation = null;
    const [header] = decodeFrameHeaders(payload);
    if ((header.deviceSn && header.deviceSn !== device) || dualCtEncodingPolicy(header, 421, 'app_mqtt').basis !== encoding) return;
    const decoded = decodeDualCtCandidates(header.pdata!, {
      productType: 421,
      cmdFunc: header.cmdFunc,
      cmdId: header.cmdId,
      source: 'app_mqtt',
      encoding: 'plain',
      encodingBasis: encoding,
      receivedAt: receipt.receivedAt,
      now,
    });
    const check = decoded?.bankChecks.find((row) => row.bank === 'B');
    if (check?.status !== 'consistent' || check.phaseValues.some((value) => Math.abs(value) > 100000)
      || Math.abs(check.phaseSum) > 100000
      || (configuration.startsWith('single_phase:') && check.phaseValues.slice(1).some((value) => value !== 0))) return;
    const powerW = check.phaseSum * (configuration.endsWith(':negative') ? -1 : 1);
    this.receipt = receipt;
    this.observation = {
      powerW: Object.is(powerW, -0) ? 0 : powerW,
      receivedAt: receipt.receivedAt,
      validUntil: receipt.receivedAt + DUAL_CT_LIVE_INTERVAL_MS,
      generation: this.generation,
    };
  }
}

import type { EcoFlowClient } from './EcoFlowClient';

type ReserveRequestClient = Pick<EcoFlowClient, 'getMainSnEnvelope' | 'getQuotaEnvelope' | 'setQuotaEnvelope'>;
export type ReserveRequestFailure = 'arguments' | 'cancelled' | 'preflight' | 'binding' | 'uncertain';
export const RESERVE_MAIN_BINDING = 'reserveRequestMainBinding';

export class ReserveRequestError extends Error {
  constructor(public readonly reason: ReserveRequestFailure) {
    super(reason);
  }
}

export const isReserveRequestSerial = (sn: unknown): sn is string => typeof sn === 'string' && /^ES2[12][A-Z0-9]{4,60}$/.test(sn);
const quotas = ['bpBackupConfig-backupSocOnOff', 'bpBackupConfig-backupSoc', 'workMode'];

export async function readReserveRequestMain(
  client: Pick<ReserveRequestClient, 'getMainSnEnvelope'>, sn: string, signal: AbortSignal,
): Promise<string> {
  if (!isReserveRequestSerial(sn) || signal.aborted) throw new ReserveRequestError('preflight');
  const response = await client.getMainSnEnvelope(sn, { signal, timeoutMs: 5000 });
  const main = (response?.data as { sn?: unknown } | undefined)?.sn;
  if (response?.code !== '0' || !isReserveRequestSerial(main)) throw new ReserveRequestError('preflight');
  return main;
}

/** One official API request, not applied control, physical verification or a restoration lease. */
export async function requestStream5000Reserve(
  client: ReserveRequestClient, sn: string, percent: number,
  signal: AbortSignal, active: () => boolean,
  { now = Date.now, approvedMain }: { now?: () => number; approvedMain?: string } = {},
): Promise<{ requestAccepted: true; applicationConfirmed: false }> {
  if (!isReserveRequestSerial(sn) || !Number.isSafeInteger(percent) || percent < 0 || percent > 100) {
    throw new ReserveRequestError('arguments');
  }
  const started = now();
  let previous = started;
  let possibleSubmission = false;
  const check = () => {
    const time = now();
    if (signal.aborted || !active() || !Number.isFinite(started) || started <= 0
      || !Number.isFinite(time) || time < previous || time - started > 15000) {
      throw new ReserveRequestError(possibleSubmission ? 'uncertain' : 'cancelled');
    }
    previous = time;
  };
  const options = { signal, timeoutMs: 5000 };
  try {
    check();
    const main = await readReserveRequestMain(client, sn, signal);
    check();
    if (approvedMain !== undefined && main !== approvedMain) throw new ReserveRequestError('binding');
    const report = await client.getQuotaEnvelope(main, [...quotas], options);
    check();
    const data = report?.data as Record<string, unknown> | undefined;
    if (report?.code !== '0' || data?.['bpBackupConfig-backupSocOnOff'] !== true
      || !Number.isSafeInteger(data['bpBackupConfig-backupSoc'])
      || Number(data['bpBackupConfig-backupSoc']) < 0 || Number(data['bpBackupConfig-backupSoc']) > 100
      || data.workMode !== 'SELF_CONSUMPTION') throw new ReserveRequestError('preflight');
    const confirmedMain = await readReserveRequestMain(client, sn, signal);
    check();
    if (confirmedMain !== main) throw new ReserveRequestError(approvedMain === undefined ? 'preflight' : 'binding');
    // Main routing is cloud-reported installation scope, never proof of unit-only effects.
    possibleSubmission = true;
    const response = await client.setQuotaEnvelope({
      sn: main,
      cmdId: 38,
      cmdFunc: 254,
      dirSrc: 1,
      dirDest: 1,
      dest: 2,
      needAck: true,
      params: { bpBackupConfig: { backupSoc: percent } },
    }, options);
    check();
    if (response?.code !== '0') throw new ReserveRequestError('uncertain');
    return { requestAccepted: true, applicationConfirmed: false };
  } catch (error) {
    if (possibleSubmission) throw new ReserveRequestError('uncertain');
    if (error instanceof ReserveRequestError) throw error;
    throw new ReserveRequestError('preflight');
  }
}

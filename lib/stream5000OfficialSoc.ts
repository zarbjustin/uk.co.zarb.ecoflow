import { EcoFlowClient } from './EcoFlowClient';

export interface Stream5000OfficialSocSample {
  percent: number;
  requestStartedAt: number;
  receivedAt: number;
  basis: 'cloud_latest_report';
  hardwareReportedAt: null;
}

export type Stream5000OfficialSocClient = Pick<EcoFlowClient, 'getMainSn' | 'getQuotaAll'>;
const family = (sn: string) => /^ES2[12][A-Z0-9]{4,60}$/.test(sn);

/** System percentage only. No unit fallback, inferred zero, power or counters. */
export async function readStream5000OfficialSoc(
  client: Stream5000OfficialSocClient, sn: string, signal: AbortSignal,
  now: () => number = Date.now,
): Promise<Stream5000OfficialSocSample | null> {
  if (!family(sn) || signal.aborted) return null;
  const requestStartedAt = now();
  const main = await client.getMainSn(sn, { fresh: true, signal });
  if (!family(main) || signal.aborted) return null;
  const quota = await client.getQuotaAll(main, { fresh: true, signal });
  const percent = quota?.['sysEnergyStreamReport-bpSoc'];
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  // Do not apply a snapshot if the main reporter changed during the read.
  const confirmedMain = await client.getMainSn(sn, { fresh: true, signal });
  const receivedAt = now();
  if (signal.aborted || confirmedMain !== main || !Number.isFinite(requestStartedAt)
    || requestStartedAt <= 0 || !Number.isFinite(receivedAt) || receivedAt < requestStartedAt
    || receivedAt - requestStartedAt > 15000) return null;
  return {
    percent: Math.round(percent), requestStartedAt, receivedAt, basis: 'cloud_latest_report', hardwareReportedAt: null,
  };
}

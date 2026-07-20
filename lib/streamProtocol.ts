'use strict';

import { StreamSetEnvelope } from './types';

/** Build the STREAM/BKW cmdFunc-254 control envelope. */
export function streamEnvelope(sn: string, params: Record<string, any>): StreamSetEnvelope {
  return {
    sn, cmdId: 17, cmdFunc: 254, dirDest: 1, dirSrc: 1, dest: 2, needAck: true, params,
  };
}

export type OperatingMode = 'self_powered' | 'ai' | 'scheduled' | 'tou';

const MODE_PARAM: Record<OperatingMode, string> = {
  self_powered: 'operateSelfPoweredOpen',
  ai: 'operateIntelligentScheduleModeOpen',
  scheduled: 'operateScheduledOpen',
  tou: 'operateTouModeOpen',
};

/** STREAM set-command builders (all target the MAIN device SN). */
export const StreamCmd = {
  ac1: (sn: string, on: boolean) => streamEnvelope(sn, { cfgRelay2Onoff: on }),
  ac2: (sn: string, on: boolean) => streamEnvelope(sn, { cfgRelay3Onoff: on }),
  backupReserve: (sn: string, soc: number) => streamEnvelope(sn, { cfgBackupReverseSoc: Math.max(3, Math.min(100, Math.round(soc))) }),
  feedIn: (sn: string, on: boolean) => streamEnvelope(sn, { cfgFeedGridMode: on ? 2 : 1 }),
  operatingMode: (sn: string, mode: OperatingMode) => streamEnvelope(sn, { cfgEnergyStrategyOperateMode: { [MODE_PARAM[mode]]: true } }),
  chargeLimit: (sn: string, soc: number) => streamEnvelope(sn, { cfgMaxChgSoc: Math.max(50, Math.min(100, Math.round(soc))) }),
  dischargeLimit: (sn: string, soc: number) => streamEnvelope(sn, { cfgMinDsgSoc: Math.max(0, Math.min(30, Math.round(soc))) }),
};

/** Minimum margin (SoC %) the backup reserve must exceed the discharge limit by. */
export const RESERVE_OVER_DISCHARGE_MARGIN = 3;

/**
 * EcoFlow rejects a backup-reserve change (error 8524) unless the target reserve
 * exceeds the current discharge limit by ~{@link RESERVE_OVER_DISCHARGE_MARGIN}.
 * Flow cards swallow that error, so a naive "set reserve" is a silent no-op and
 * the battery never releases. This returns the ordered command sequence to apply
 * a target reserve safely: lower the discharge limit first when needed, then set
 * the reserve. Pure and side-effect free so it can be unit-tested.
 */
export function backupReserveSequence(
  sn: string,
  targetSoc: number,
  currentDischargeLimit: number | undefined,
): { reserve: number; newDischargeLimit?: number; commands: StreamSetEnvelope[] } {
  const reserve = Math.max(3, Math.min(100, Math.round(targetSoc)));
  const commands: StreamSetEnvelope[] = [];
  let newDischargeLimit: number | undefined;
  if (typeof currentDischargeLimit === 'number'
      && Number.isFinite(currentDischargeLimit)
      && reserve <= currentDischargeLimit + RESERVE_OVER_DISCHARGE_MARGIN) {
    newDischargeLimit = Math.max(0, Math.min(30, reserve - RESERVE_OVER_DISCHARGE_MARGIN));
    commands.push(StreamCmd.dischargeLimit(sn, newDischargeLimit));
  }
  commands.push(StreamCmd.backupReserve(sn, reserve));
  return { reserve, newDischargeLimit, commands };
}

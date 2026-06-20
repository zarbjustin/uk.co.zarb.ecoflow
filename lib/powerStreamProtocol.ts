'use strict';

/**
 * PowerStream (WN511) set-command builders.
 * Sent via PUT /iot-open/sign/device/quota as { sn, cmdCode, params }.
 * Power is in 0.1 W units on the wire.
 */
export const PsCmd = {
  supplyPriority: (sn: string, storage: boolean) => ({
    sn,
    cmdCode: 'WN511_SET_SUPPLY_PRIORITY_PACK',
    params: { supplyPriority: storage ? 1 : 0 },
  }),
  outputWatts: (sn: string, watts: number) => ({
    sn,
    cmdCode: 'WN511_SET_PERMANENT_WATTS_PACK',
    params: { permanentWatts: Math.max(0, Math.min(800, Math.round(watts))) * 10 },
  }),
  dischargeLimit: (sn: string, pct: number) => ({
    sn,
    cmdCode: 'WN511_SET_BAT_LOWER_PACK',
    params: { lowerLimit: Math.max(1, Math.min(30, Math.round(pct))) },
  }),
  chargeLimit: (sn: string, pct: number) => ({
    sn,
    cmdCode: 'WN511_SET_BAT_UPPER_PACK',
    params: { upperLimit: Math.max(70, Math.min(100, Math.round(pct))) },
  }),
  brightness: (sn: string, value: number) => ({
    sn,
    cmdCode: 'WN511_SET_BRIGHTNESS_PACK',
    params: { brightness: Math.max(0, Math.min(1023, Math.round(value))) },
  }),
};

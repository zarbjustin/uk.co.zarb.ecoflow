'use strict';

/** Reserve-only grammar from shuette42/ecoflow-energy-ha cd82685, MIT.
 * See docs/third-party/ecoflow-energy-ha-LICENSE.txt. No time-task/grid/output writes.
 */
export function houseReserveFrame(sn: string, enabled: boolean, percent: number, sequence: number): Buffer {
  if (!/^ES21[A-Z0-9]{4,60}$/.test(sn) || typeof enabled !== 'boolean'
    || !Number.isSafeInteger(percent) || percent < 0 || percent > 100
    || !Number.isSafeInteger(sequence) || sequence < 1 || sequence > 0x7fffffff) throw new Error('Invalid house reserve request');
  const vi = (value: number | bigint): Buffer => {
    let n = BigInt(value); const a = [];
    do {
      let b = Number(n & 127n); n >>= 7n; if (n) b |= 128; a.push(b);
    } while (n);
    return Buffer.from(a);
  };
  const v = (field: number, value: number | bigint): Buffer => Buffer.concat([vi(field * 8), vi(value)]);
  const b = (field: number, value: Buffer): Buffer => Buffer.concat([vi(field * 8 + 2), vi(value.length), value]);
  const payload = Buffer.concat([v(1, 30), b(30, Buffer.concat([v(1, enabled ? 1 : 0), v(2, percent)]))]);
  const serial = Buffer.from(sn, 'ascii');
  return b(1, Buffer.concat([b(1, payload), v(2, 32), v(3, 2), v(4, 1), v(5, 1), v(8, 254), v(9, 38), v(10, payload.length), v(11, 1), v(14, sequence), v(15, (1n << 64n) - 116n), v(16, 4),
    b(23, Buffer.from('Android')), b(26, serial), b(27, serial)]));
}

export function freshReserveSnapshot(snapshot: any): { enabled: boolean; percent: number; ageSec: number; enabledAgeSec: number; percentAgeSec: number } {
  const r = snapshot?.values;
  for (const key of ['backupReserveEnabled', 'backupReservePct', 'mode', 'tasks']) {
    const v = r?.[key];
    if (!v || v.stale !== false || !Number.isFinite(v.ageSec) || v.ageSec < 0 || v.ageSec > 1200) throw new Error('House reserve/configuration stale');
  }
  if (r.mode.value !== 'self_powered' || !Array.isArray(r.tasks.value) || r.tasks.value.length) throw new Error('House mode/task ownership conflict');
  if (typeof r.backupReserveEnabled.value !== 'boolean' || !Number.isSafeInteger(r.backupReservePct.value)
    || r.backupReservePct.value < 0 || r.backupReservePct.value > 100) throw new Error('Unknown house reserve');
  return {
    enabled: r.backupReserveEnabled.value,
    percent: r.backupReservePct.value,
    ageSec: Math.max(r.backupReserveEnabled.ageSec, r.backupReservePct.ageSec),
    enabledAgeSec: r.backupReserveEnabled.ageSec,
    percentAgeSec: r.backupReservePct.ageSec,
  };
}

/** An actual fresh battery-power receipt and native reserve hold are both required. */
export function assertHouseNoDischarge(device: any, maxHouseW = Infinity): void {
  if (!(maxHouseW >= 0)) throw new Error('House headroom unknown');
  if (!device?.getAvailable()) throw new Error('House unavailable');
  const reserve = freshReserveSnapshot(device.getConfigurationDiagnostics());
  const readings = device.getReadingDiagnostics();
  for (const [cap, maxAge] of [['measure_battery', 300], ['stream_unit_power_battery_flow', 30]] as const) {
    const field = readings[cap];
    if (field?.stale !== false || field.applicationStatus !== 'applied' || !Number.isFinite(field.ageSec)
      || field.ageSec < 0 || field.ageSec > maxAge) throw new Error('House battery receipt stale/unknown');
  }
  const soc = device.getCapabilityValue('measure_battery');
  const power = device.getCapabilityValue('stream_unit_power_battery_flow');
  if (!reserve.enabled || !Number.isFinite(soc) || soc < 0 || soc > 100 || reserve.percent < soc
    || !Number.isFinite(power) || power < 0 || power > maxHouseW) throw new Error('House no-discharge/headroom hold unverified');
}

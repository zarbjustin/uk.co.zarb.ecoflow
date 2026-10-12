'use strict';

/** Titles describe the measurement, not the battery's installation or Energy role. */
export const STREAM_5000_UNIT_TITLES: Record<string, Record<string, string>> = {
  measure_battery: { en: 'Unit battery level', de: 'Einheit: Batteriestand', nl: 'Unit: batterijniveau' },
  battery_charging_state: { en: 'Unit battery state', de: 'Einheit: Batteriestatus', nl: 'Unit: batterijstatus' },
  stream_unit_power_battery_flow: { en: 'Unit battery flow', de: 'Einheit: Batteriefluss', nl: 'Unit: batterijstroom' },
  measure_temperature: { en: 'Unit battery temperature', de: 'Einheit: Batterietemperatur', nl: 'Unit: batterijtemperatuur' },
  battery_soh: { en: 'Unit battery health', de: 'Einheit: Batteriezustand', nl: 'Unit: batterijconditie' },
  'measure_power.load': { en: 'System house consumption', de: 'System: Hausverbrauch', nl: 'Systeem: huisverbruik' },
  'measure_power.grid': { en: 'System grid meter', de: 'System: Netzzähler', nl: 'Systeem: netmeter' },
  'measure_power.grid_import': { en: 'System grid import (flow)', de: 'System: Netzbezug (Fluss)', nl: 'Systeem: netafname (stroom)' },
  'measure_power.grid_export': { en: 'System grid export (flow)', de: 'System: Einspeisung (Fluss)', nl: 'Systeem: teruglevering (stroom)' },
};

export const STREAM_UNIT_GRID_TITLE = {
  en: 'Unit grid connection port', de: 'Einheit: Netzanschluss', nl: 'Unit: netaansluiting',
};

// Released v1.10.34 defaults: migrate these as well as the older import/export
// titles. EcoFlow calls this connection "Grid connection port" in its app.
const PREVIOUS_SCOPED_TITLES: Record<string, Record<string, string>> = {
  stream_unit_power_grid: {
    en: 'Unit grid-port power', de: 'Einheit: Netzanschlussleistung', nl: 'Unit: netaansluitvermogen',
  },
};

const LEGACY_TITLES: Record<string, Record<string, string>> = {
  charge_remaining: { en: 'Charge time remaining', de: 'Verbleibende Ladezeit', nl: 'Resterende laadtijd' },
  discharge_remaining: { en: 'Discharge time remaining', de: 'Verbleibende Entladezeit', nl: 'Resterende ontlaadtijd' },
  measure_battery: { en: 'Battery', de: 'Batterie', nl: 'Batterij' },
  battery_charging_state: { en: 'Battery state', de: 'Batteriestatus', nl: 'Batterijstatus' },
  stream_unit_power_battery_flow: { en: 'Battery flow', de: 'Batteriefluss', nl: 'Batterijstroom' },
  measure_temperature: { en: 'Battery temperature', de: 'Batterietemperatur', nl: 'Batterijtemperatuur' },
  battery_soh: { en: 'Battery health', de: 'Batteriezustand', nl: 'Batterijconditie' },
  'measure_power.load': { en: 'House consumption', de: 'Hausverbrauch', nl: 'Huisverbruik' },
  'measure_power.grid': { en: 'Grid import/export', de: 'Netzbezug/-einspeisung', nl: 'Netafname/-teruglevering' },
  'measure_power.grid_import': { en: 'Grid import', de: 'Netzbezug', nl: 'Netafname' },
  'measure_power.grid_export': { en: 'Grid export', de: 'Netzeinspeisung', nl: 'Netteruglevering' },
  stream_unit_power_grid: { en: 'Grid import/export', de: 'Netzbezug/-einspeisung', nl: 'Netafname/-teruglevering' },
};

/** Migrate known defaults only. Never overwrite a user's custom title or other options. */
export function scopedReadingOptions(key: string, options: any, titles: Record<string, string>): Record<string, unknown> | null {
  const legacy = LEGACY_TITLES[key];
  if (!legacy || !options || typeof options !== 'object' || Array.isArray(options)) return null;
  const current = options.title;
  if (current === undefined) return { ...options, title: { ...titles } };
  if (typeof current === 'string') {
    const defaults = [...Object.values(legacy), ...Object.values(PREVIOUS_SCOPED_TITLES[key] || {})];
    return defaults.includes(current) ? { ...options, title: { ...titles } } : null;
  }
  if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
  const next = { ...current };
  for (const lang of Object.keys(titles)) {
    if (next[lang] === undefined || next[lang] === legacy[lang]
      || next[lang] === PREVIOUS_SCOPED_TITLES[key]?.[lang]) next[lang] = titles[lang];
  }
  return Object.keys(titles).some((lang) => next[lang] !== current[lang]) ? { ...options, title: next } : null;
}

/** Cosmetic migration must never interrupt startup or telemetry. Homey can throw
 * "Invalid Capability" for a valid custom capability without an options entry.
 * Do not assume {} on a failed read: that could overwrite a user's custom title.
 */
export async function migrateReadingTitle(device: {
  hasCapability: (key: string) => boolean;
  getCapabilityOptions?: (key: string) => unknown;
  setCapabilityOptions?: (key: string, options: object) => Promise<void>;
}, key: string, titles: Record<string, string>, active: () => boolean = () => true): Promise<void> {
  try {
    if (!active() || !device.hasCapability(key)
      || typeof device.getCapabilityOptions !== 'function' || typeof device.setCapabilityOptions !== 'function') return;
    const options = scopedReadingOptions(key, device.getCapabilityOptions(key), titles);
    if (options && active() && device.hasCapability(key)) await device.setCapabilityOptions(key, options);
  } catch {
    // Keep existing options and continue startup. Missing options are not a lost
    // capability, and a failed title write is not an EcoFlow connection failure.
  }
}

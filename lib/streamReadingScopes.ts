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
  en: 'Unit grid-port power', de: 'Einheit: Netzanschlussleistung', nl: 'Unit: netaansluitvermogen',
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
    return Object.values(legacy).includes(current) ? { ...options, title: { ...titles } } : null;
  }
  if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
  const next = { ...current };
  for (const lang of Object.keys(titles)) {
    if (next[lang] === undefined || next[lang] === legacy[lang]) next[lang] = titles[lang];
  }
  return Object.keys(titles).some((lang) => next[lang] !== current[lang]) ? { ...options, title: next } : null;
}

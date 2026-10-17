/** Presentation only: community-observed field groups, NOT a verified Energy contract. */
import { DUAL_CT_FIELD_DEFINITIONS } from './dualCtContract';

const locales = ['en-GB', 'de-DE', 'nl-NL'];
const formats = new Map<string, Intl.NumberFormat>();
const quantities = {
  power: { unit: 'W', decimals: 1 },
  voltage: { unit: 'V', decimals: 1 },
  current: { unit: 'A', decimals: 3 },
};

/** Raw cache/decoder values are untouched. No units are assigned to totals or counters. */
export function dualCtDisplayValue(field: number, value: unknown, locale: unknown = 'en-GB'): string | null {
  const definition = DUAL_CT_FIELD_DEFINITIONS.find((row) => row.field === field && row.phase !== null);
  if (!definition || definition.quantity === 'total_power' || typeof value !== 'number' || !Number.isFinite(value)) return null;
  const { unit, decimals } = quantities[definition.quantity];
  const language = typeof locale === 'string' && locales.includes(locale) ? locale : 'en-GB';
  // Tiny signed values must not become an apparent zero or lose their sign to rounding.
  const scientific = value !== 0 && Math.abs(value) < 0.5 * 10 ** -decimals;
  const key = `${language}:${decimals}:${scientific}`;
  if (!formats.has(key)) {
    formats.set(key, new Intl.NumberFormat(language, {
      useGrouping: false,
      minimumFractionDigits: scientific ? 0 : decimals,
      maximumFractionDigits: scientific ? 2 : decimals,
      notation: scientific ? 'scientific' : 'standard',
    }));
  }
  return `${formats.get(key)!.format(Object.is(value, -0) ? 0 : value)} ${unit}`;
}

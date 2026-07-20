'use strict';

import https from 'https';

export interface SolarRadiation {
  /** shortwave_radiation_sum for today (MJ/m²), or null. */
  today: number | null;
  /** shortwave_radiation_sum for tomorrow (MJ/m²), or null. */
  tomorrow: number | null;
}

export interface SolarForecast {
  todayKwh: number | null;
  tomorrowKwh: number | null;
}

/**
 * Convert Open-Meteo daily shortwave radiation (MJ/m²) to an expected PV yield
 * (kWh) using a per-installation calibration factor. The app's own reliable
 * `energy_solar_today` empirically calibrates to ~0.67 kWh per MJ/m² for a
 * reference system; users can tune the factor for their array size.
 */
export function radiationToKwh(mjPerM2: number | null, factor: number): number | null {
  if (mjPerM2 == null || !Number.isFinite(mjPerM2) || !Number.isFinite(factor)) return null;
  return Math.max(0, mjPerM2 * factor);
}

/** Parse the Open-Meteo daily response into today/tomorrow radiation (MJ/m²). */
export function parseRadiation(json: any): SolarRadiation {
  const arr = json?.daily?.shortwave_radiation_sum;
  const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (!Array.isArray(arr)) return { today: null, tomorrow: null };
  return { today: num(arr[0]), tomorrow: num(arr[1]) };
}

/** Build a forecast (kWh) from radiation + calibration factor. */
export function toForecast(radiation: SolarRadiation, factor: number): SolarForecast {
  return {
    todayKwh: radiationToKwh(radiation.today, factor),
    tomorrowKwh: radiationToKwh(radiation.tomorrow, factor),
  };
}

function defaultGetJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c as Buffer));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (e) {
          reject(new Error('Open-Meteo: invalid JSON'));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Open-Meteo: request timed out')));
    req.on('error', reject);
  });
}

/**
 * Fetch today/tomorrow shortwave radiation for a location from Open-Meteo
 * (free, keyless). `getJson` is injectable for testing.
 */
export async function fetchSolarRadiation(
  latitude: number,
  longitude: number,
  getJson: (url: string) => Promise<any> = defaultGetJson,
): Promise<SolarRadiation> {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { today: null, tomorrow: null };
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}`
    + `&longitude=${lon.toFixed(4)}&daily=shortwave_radiation_sum&timezone=auto&forecast_days=2`;
  const json = await getJson(url);
  return parseRadiation(json);
}

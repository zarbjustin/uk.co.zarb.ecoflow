'use strict';

/**
 * Generates accurate widget preview images (preview-light.png / preview-dark.png)
 * for every widget by rendering the widget's REAL public/index.html with
 * representative fixture data and screenshotting it at 1024x1024. This guarantees
 * each preview is a true picture of its widget (Homey App Store certification
 * requires previews that match the actual widget, and that they are not identical
 * across widgets).
 *
 * Usage: node scripts/generate-widget-previews.mjs
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// A single rich fixture — a superset of the shape `widgets/stream_common.js`
// returns, plus the derived fields the solar/tariff api.js add. Each widget
// reads only the fields it needs, so one fixture drives all five accurately.
const fixture = {
  ok: true,
  name: 'STREAM Ultra',
  available: true,
  grid: -600, // negative = exporting
  gridImport: 0,
  gridExport: 600,
  solar: 1240,
  home: 640,
  battery: 280, // positive = charging
  batteryCharge: 280,
  batteryDischarge: 0,
  soc: 76,
  state: 'charging',
  mode: 'tou',
  feedIn: true,
  backupReserve: 20,
  chargeLimit: 100,
  dischargeLimit: 10,
  chargeRemaining: 95,
  dischargeRemaining: 0,
  solarToday: 8.42,
  consumptionToday: 6.1,
  gridImportToday: 4.6,
  gridExportToday: 2.1,
  savingsToday: 1.2,
  co2Today: 3.1,
  independence: 68,
  // solar_forecast api.js derives these:
  target: 10,
  progress: 84,
  forecastToday: 9.2,
  forecastTomorrow: 7.4,
  solarForecastToday: 9.2,
  solarForecastTomorrow: 7.4,
  // tariff/recommendation api.js derives these:
  recommendation: 'Store solar',
  reason: 'Solar is above home load; spare power can charge the battery.',
};

// All widget folders (each has public/index.html). Discovered dynamically.
const widgets = fs.readdirSync(path.join(root, 'widgets'), { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, 'widgets', e.name, 'public', 'index.html')))
  .map((e) => e.name);

const modes = [
  { name: 'light', bg: '#eef1f5' },
  { name: 'dark', bg: '#0b0f14' },
];

async function main() {
  const browser = await chromium.launch();
  try {
    for (const dir of widgets) {
      const indexPath = path.join(root, 'widgets', dir, 'public', 'index.html');
      const url = pathToFileURL(indexPath).href;
      for (const m of modes) {
        const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
        await page.goto(url, { waitUntil: 'load' });
        await page.addStyleTag({
          content: `html,body{height:1024px;margin:0}
            body{display:flex !important;align-items:center;justify-content:center;background:${m.bg} !important}
            body>.card,body>#card{width:360px !important;box-shadow:0 12px 48px rgba(0,0,0,0.28)}`,
        });
        await page.evaluate((data) => {
          const Homey = {
            ready() {},
            getSettings() { return { target: 10 }; },
            getDeviceIds() { return []; },
            getWidgetInstanceId() { return 'preview'; },
            api() { return Promise.resolve(data); },
            on() {},
            setHeight() {},
            __(s) { return s; },
          };
          if (typeof window.onHomeyReady === 'function') window.onHomeyReady(Homey);
        }, fixture);
        await page.waitForTimeout(500);
        const out = path.join(root, 'widgets', dir, `preview-${m.name}.png`);
        await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
        await page.close();
        console.log('wrote', path.relative(root, out));
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

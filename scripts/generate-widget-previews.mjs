'use strict';

/**
 * Generates accurate widget preview images (preview-light.png / preview-dark.png)
 * for every widget by rendering the widget's REAL public/index.html with
 * representative fixture data and screenshotting it at 1024x1024. This guarantees
 * each preview is a true picture of its widget (Homey App Store certification
 * requires previews that match the actual widget).
 *
 * Usage: node scripts/generate-widget-previews.mjs
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Representative fixtures — one per widget, matching the shape each api.js returns.
const widgets = [
  {
    dir: 'stream_flow',
    fixture: {
      ok: true, name: 'STREAM Ultra', available: true,
      grid: -320, solar: 1240, home: 640, battery: 280, soc: 76,
      state: 'charging', solarToday: 8.42,
    },
  },
  {
    dir: 'stream_battery',
    fixture: {
      ok: true, name: 'STREAM Ultra', available: true,
      soc: 76, reserve: 20, dischargeLimit: 10, chargeLimit: 100,
      battery: 280, state: 'charging', chargeRemaining: 95, dischargeRemaining: 0,
      mode: 'tou', soh: 99,
    },
  },
  {
    dir: 'stream_solar_today',
    fixture: {
      ok: true, name: 'STREAM Solar', available: true,
      solarToday: 8.42, pv: 1240, strings: [420, 360, 300, 160],
      co2: 3.1, independence: 68,
    },
  },
  {
    dir: 'stream_grid',
    fixture: {
      ok: true, name: 'STREAM Grid', available: true,
      grid: -320, importToday: 4.6, exportToday: 2.1, feedIn: true,
    },
  },
  {
    dir: 'stream_tariff',
    fixture: {
      ok: true, name: 'STREAM Ultra', available: true,
      mode: 'tou', reserve: 80, chargeLimit: 100, dischargeLimit: 10,
      feedIn: false, grid: 1500, soc: 64,
    },
  },
];

const modes = [
  { name: 'light', bg: '#eef1f5' },
  { name: 'dark', bg: '#0b0f14' },
];

async function main() {
  const browser = await chromium.launch();
  try {
    for (const w of widgets) {
      const indexPath = path.join(root, 'widgets', w.dir, 'public', 'index.html');
      const url = pathToFileURL(indexPath).href;
      for (const m of modes) {
        const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
        await page.goto(url, { waitUntil: 'load' });
        await page.addStyleTag({
          content: `html,body{height:1024px;margin:0}
            body{display:flex !important;align-items:center;justify-content:center;background:${m.bg} !important}
            body>.card{width:360px !important;box-shadow:0 12px 48px rgba(0,0,0,0.28)}`,
        });
        await page.evaluate((fixture) => {
          const Homey = {
            ready() {},
            getSettings() { return {}; },
            getDeviceIds() { return []; },
            getWidgetInstanceId() { return 'preview'; },
            api() { return Promise.resolve(fixture); },
            on() {},
            setHeight() {},
            __(s) { return s; },
          };
          if (typeof window.onHomeyReady === 'function') window.onHomeyReady(Homey);
        }, w.fixture);
        await page.waitForTimeout(500);
        const out = path.join(root, 'widgets', w.dir, `preview-${m.name}.png`);
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

'use strict';

/**
 * Generates Homey App Store compliant widget previews.
 *
 * The previews are purpose-built vector illustrations rather than screenshots
 * of the live widgets. Each export is 1024x1024, text-free, and rendered onto
 * a transparent canvas for both light and dark mode.
 *
 * Usage: node scripts/generate-widget-previews.mjs
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

export const themes = {
  light: {
    card: '#FCFCFD',
    layer: '#F0F3F7',
    track: '#D8DEE7',
    line: '#AAB5C3',
    border: '#E2E7EE',
    shadow: '#111827',
    shadowOpacity: 0.18,
  },
  dark: {
    card: '#202937',
    layer: '#2B3748',
    track: '#46556B',
    line: '#91A0B5',
    border: '#3B485C',
    shadow: '#000000',
    shadowOpacity: 0.34,
  },
};

const accents = {
  stream_balance: '#1683E6',
  stream_battery_plan: '#24B36B',
  stream_flow: '#0E9F8A',
  stream_solar_forecast: '#F2B705',
  stream_tariff_opportunity: '#8B5CF6',
};

function pill(x, y, width, height, fill) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}" fill="${fill}"/>`;
}

function flowArtwork(theme, accent) {
  return `
    <path d="M286 518 C352 518 390 430 476 430 S620 518 738 518"
      fill="none" stroke="${theme.track}" stroke-width="32" stroke-linecap="round"/>
    <path d="M286 518 C352 518 390 430 476 430 S620 518 738 518"
      fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>
    <circle cx="286" cy="518" r="54" fill="${theme.layer}" stroke="${accent}" stroke-width="14"/>
    <circle cx="476" cy="430" r="70" fill="${accent}"/>
    <circle cx="738" cy="518" r="54" fill="${theme.layer}" stroke="${accent}" stroke-width="14"/>
    ${pill(270, 650, 484, 34, theme.track)}
    ${pill(270, 650, 326, 34, accent)}
  `;
}

function balanceArtwork(theme, accent) {
  return `
    ${pill(248, 342, 528, 68, theme.track)}
    ${pill(248, 342, 356, 68, accent)}
    <circle cx="604" cy="376" r="18" fill="${theme.card}" stroke="${accent}" stroke-width="10"/>
    ${pill(248, 466, 528, 68, theme.track)}
    ${pill(248, 466, 238, 68, accent)}
    <circle cx="486" cy="500" r="18" fill="${theme.card}" stroke="${accent}" stroke-width="10"/>
    ${pill(326, 622, 372, 30, theme.layer)}
    <circle cx="512" cy="637" r="30" fill="${accent}"/>
  `;
}

function batteryArtwork(theme, accent) {
  return `
    <circle cx="512" cy="472" r="154" fill="none" stroke="${theme.track}" stroke-width="54"/>
    <circle cx="512" cy="472" r="154" fill="none" stroke="${accent}" stroke-width="54"
      stroke-linecap="round" stroke-dasharray="725 968" transform="rotate(128 512 472)"/>
    <circle cx="512" cy="472" r="88" fill="${theme.layer}"/>
    ${pill(464, 446, 96, 52, accent)}
    ${pill(284, 662, 196, 32, theme.track)}
    ${pill(544, 662, 196, 32, theme.track)}
    ${pill(284, 662, 126, 32, accent)}
    ${pill(544, 662, 78, 32, accent)}
  `;
}

function solarArtwork(theme, accent) {
  const rays = [
    [694, 322, 694, 292],
    [694, 418, 694, 448],
    [646, 370, 616, 370],
    [742, 370, 772, 370],
    [660, 336, 638, 314],
    [728, 336, 750, 314],
    [660, 404, 638, 426],
    [728, 404, 750, 426],
  ].map(([x1, y1, x2, y2]) => (
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>`
  )).join('');

  return `
    <circle cx="694" cy="370" r="48" fill="${accent}"/>
    ${rays}
    <path d="M242 620 C342 610 390 548 454 558 S566 472 624 486 S718 430 786 452"
      fill="none" stroke="${theme.track}" stroke-width="30" stroke-linecap="round"/>
    <path d="M242 620 C342 610 390 548 454 558 S566 472 624 486 S718 430 786 452"
      fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>
    ${pill(276, 656, 48, 54, theme.line)}
    ${pill(368, 624, 48, 86, theme.line)}
    ${pill(460, 588, 48, 122, theme.line)}
    ${pill(552, 544, 48, 166, accent)}
    ${pill(644, 504, 48, 206, theme.line)}
  `;
}

function tariffArtwork(theme, accent) {
  const bars = [
    [276, 438, 72, 220, theme.line],
    [386, 350, 72, 308, theme.track],
    [496, 510, 72, 148, accent],
    [606, 390, 72, 268, theme.track],
    [716, 462, 72, 196, theme.line],
  ].map(([x, y, width, height, fill]) => (
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="36" fill="${fill}"/>`
  )).join('');

  return `
    ${bars}
    <circle cx="532" cy="444" r="62" fill="${theme.layer}" stroke="${accent}" stroke-width="14"/>
    <path d="M502 432 L532 462 L574 410" fill="none" stroke="${accent}" stroke-width="20"
      stroke-linecap="round" stroke-linejoin="round"/>
    ${pill(346, 696, 332, 28, theme.layer)}
    ${pill(466, 696, 92, 28, accent)}
  `;
}

export const previewDefinitions = {
  stream_balance: balanceArtwork,
  stream_battery_plan: batteryArtwork,
  stream_flow: flowArtwork,
  stream_solar_forecast: solarArtwork,
  stream_tariff_opportunity: tariffArtwork,
};

export function buildPreviewSvg(widgetId, mode) {
  const theme = themes[mode];
  const artwork = previewDefinitions[widgetId];
  const accent = accents[widgetId];

  if (!theme) throw new Error(`Unknown preview mode: ${mode}`);
  if (!artwork || !accent) throw new Error(`Unknown widget preview: ${widgetId}`);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <defs>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="28" stdDeviation="30"
            flood-color="${theme.shadow}" flood-opacity="${theme.shadowOpacity}"/>
        </filter>
      </defs>
      <rect x="152" y="222" width="720" height="580" rx="76"
        fill="${theme.card}" stroke="${theme.border}" stroke-width="3" filter="url(#shadow)"/>
      ${artwork(theme, accent)}
    </svg>
  `;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    deviceScaleFactor: 1,
  });

  try {
    for (const [widgetId] of Object.entries(previewDefinitions)) {
      for (const mode of Object.keys(themes)) {
        const svg = buildPreviewSvg(widgetId, mode);
        await page.setContent(`
          <!doctype html>
          <html>
            <head>
              <style>
                html, body { width: 1024px; height: 1024px; margin: 0; background: transparent; }
                svg { display: block; }
              </style>
            </head>
            <body>${svg}</body>
          </html>
        `);

        const out = path.join(root, 'widgets', widgetId, `preview-${mode}.png`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await page.screenshot({
          path: out,
          clip: { x: 0, y: 0, width: 1024, height: 1024 },
          omitBackground: true,
        });
        console.log('wrote', path.relative(root, out));
      }
    }
  } finally {
    await page.close();
    await browser.close();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

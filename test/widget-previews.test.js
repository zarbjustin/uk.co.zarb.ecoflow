'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const generatorPath = path.join(root, 'scripts', 'generate-widget-previews.mjs');
const widgetIds = [
  'stream_balance',
  'stream_battery_plan',
  'stream_flow',
  'stream_solar_forecast',
  'stream_tariff_opportunity',
];

function inspectPng(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 33);
  assert.equal(header.toString('hex', 0, 8), '89504e470d0a1a0a', `${filePath} is not a PNG`);
  assert.equal(header.toString('ascii', 12, 16), 'IHDR', `${filePath} has no IHDR chunk`);
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
    colorType: header.readUInt8(25),
  };
}

test('preview generator builds text-free vector artwork', async () => {
  const source = fs.readFileSync(generatorPath, 'utf8');
  assert.equal(source.includes('public/index.html'), false);
  assert.equal(source.includes('page.goto('), false);
  assert.equal(source.includes('<text'), false);
  assert.equal(source.includes('omitBackground: true'), true);

  const generator = await import(pathToFileURL(generatorPath).href);
  assert.deepEqual(Object.keys(generator.previewDefinitions).sort(), widgetIds.slice().sort());

  for (const widgetId of widgetIds) {
    for (const mode of ['light', 'dark']) {
      const svg = generator.buildPreviewSvg(widgetId, mode);
      assert.match(svg, /<svg[^>]+width="1024"[^>]+height="1024"/);
      assert.equal(svg.includes('<text'), false);
      assert.equal(svg.includes('<image'), false);
      assert.equal(svg.includes('data:image'), false);
    }
  }
});

test('all widget previews are 1024x1024 PNGs with alpha', () => {
  for (const widgetId of widgetIds) {
    for (const mode of ['light', 'dark']) {
      const filePath = path.join(root, 'widgets', widgetId, `preview-${mode}.png`);
      const png = inspectPng(filePath);
      assert.equal(png.width, 1024, filePath);
      assert.equal(png.height, 1024, filePath);
      assert.ok([4, 6].includes(png.colorType), `${filePath} does not contain an alpha channel`);
    }
  }
});

test('all widget preview canvases use transparent outer pixels', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    for (const widgetId of widgetIds) {
      for (const mode of ['light', 'dark']) {
        const filePath = path.join(root, 'widgets', widgetId, `preview-${mode}.png`);
        await page.goto(pathToFileURL(filePath).href);
        const alpha = await page.evaluate(() => {
          const image = document.querySelector('img');
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0);
          return {
            corner: context.getImageData(0, 0, 1, 1).data[3],
            centre: context.getImageData(512, 512, 1, 1).data[3],
          };
        });
        assert.equal(alpha.corner, 0, `${filePath} has an opaque canvas`);
        assert.equal(alpha.centre, 255, `${filePath} has no opaque central artwork`);
      }
    }
  } finally {
    await page.close();
    await browser.close();
  }
});

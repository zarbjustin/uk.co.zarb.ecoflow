'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');

test('both 5000 store roles reference shared correctly sized product photo PNGs', () => {
  for (const id of ['stream_5000_unit', 'stream_5000_system']) {
    const driver = require(`../drivers/${id}/driver.compose.json`);
    for (const [name, size] of [['small', 75], ['large', 500], ['xlarge', 1000]]) {
      assert.equal(driver.images[name], `/drivers/stream_ac5000/assets/images/${name}.png`);
      const png = fs.readFileSync(path.join(root, driver.images[name]));
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.equal(png.readUInt32BE(16), size);
      assert.equal(png.readUInt32BE(20), size);
    }
  }
});

test('photo correction retains approved wireframe SVGs byte for byte', () => {
  for (const id of ['stream_ac5000', 'stream_5000_unit', 'stream_5000_system']) {
    const svg = fs.readFileSync(path.join(root, 'drivers', id, 'assets/icon.svg'));
    assert.equal(crypto.createHash('sha1').update(svg).digest('hex'), '85892dd81c501b40f448491dd00a412f5ab19890');
  }
});

test('photo and wireframe preparation cannot target the same active store raster directory', () => {
  const photo = fs.readFileSync(path.join(root, 'scripts/prepare-stream-5000-store-photo.cjs'), 'utf8');
  const wireframe = fs.readFileSync(path.join(root, 'scripts/prepare-stream-5000-artwork.cjs'), 'utf8');
  assert.match(photo, /docs\/assets\/stream-ac-5000\/product-original\.png/);
  assert.match(photo, /fit: 'contain'/);
  assert.ok(!photo.includes('assets/icon.svg'));
  assert.ok(!wireframe.includes('drivers/stream_ac5000/assets/images'));
  assert.match(wireframe, /docs\/assets\/stream-ac-5000\/wireframe-images/);
});

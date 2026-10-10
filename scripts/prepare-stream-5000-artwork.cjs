'use strict';

// Asset preparation only; sharp can be supplied by the workspace runtime via NODE_PATH.
// The SVG is a mechanical alpha trace of the approved artwork, not a redrawn device.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const sharp = require('sharp');

async function main() {
  const root = path.resolve(__dirname, '..');
  const source = process.argv[2];
  if (!source) throw new Error('Usage: node scripts/prepare-stream-5000-artwork.cjs <transparent-line-art.png> [standalone-output-directory]');
  // Standalone mode stages future product assets without touching active drivers.
  const standalone = process.argv[3] ? path.resolve(process.argv[3]) : null;
  const images = standalone ? path.join(standalone, 'images') : path.join(root, 'drivers/stream_ac5000/assets/images');
  await fs.mkdir(images, { recursive: true });
  const normalized = await sharp(source).trim().resize(860, 860, { fit: 'inside' }).png().toBuffer();
  const square = await sharp({ create: { width: 1000, height: 1000, channels: 4, background: '#00000000' } })
    .composite([{ input: normalized, gravity: 'centre' }]).png().toBuffer();
  // Homey requires raster store images at these sizes. All share one framing.
  for (const [name, size] of [['small', 75], ['large', 500], ['xlarge', 1000]]) {
    await sharp(square).resize(size, size).png().toFile(path.join(images, `${name}.png`));
  }
  const { data, info } = await sharp(square).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rectangles = [];
  let previous = new Map();
  for (let y = 0; y < info.height; y++) {
    const current = new Map();
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < 100) continue;
      const start = x;
      while (x + 1 < info.width && data[(y * info.width + x + 1) * 4 + 3] >= 100) x++;
      const width = x - start + 1;
      const key = `${start}:${width}`;
      const rect = previous.get(key) || { x: start, y, width, height: 0 };
      if (!previous.has(key)) rectangles.push(rect);
      rect.height++;
      current.set(key, rect);
    }
    previous = current;
  }
  const outline = rectangles.map((r) => `M${r.x} ${r.y}h${r.width}v${r.height}h-${r.width}Z`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">\n  <path fill="#15171A" d="${outline}"/>\n</svg>\n`;
  if (standalone) {
    await fs.writeFile(path.join(standalone, 'icon.svg'), svg);
  } else {
    for (const id of ['stream_ac5000', 'stream_5000_unit', 'stream_5000_system']) {
      await fs.writeFile(path.join(root, 'drivers', id, 'assets/icon.svg'), svg);
    }
  }
  // A white-backed preview is for visual QA only, never used as a driver icon.
  await sharp(square).flatten({ background: '#fff' }).resize(500).png()
    .toFile(standalone ? path.join(standalone, 'wireframe-preview.png') : path.join(os.tmpdir(), 'stream-5000-wireframe-preview.png'));
  console.log(`Prepared ${standalone ? 'standalone' : 'shared driver'} STREAM artwork and ${rectangles.length} traced icon rectangles.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

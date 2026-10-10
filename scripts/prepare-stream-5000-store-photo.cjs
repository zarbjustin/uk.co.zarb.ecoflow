'use strict';

// Package the supplied product photograph; never generate or touch SVG icons.
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  const root = path.resolve(__dirname, '..');
  const source = path.join(root, 'docs/assets/stream-ac-5000/product-original.png');
  const destination = path.join(root, 'drivers/stream_ac5000/assets/images');
  for (const [name, size] of [['small', 75], ['large', 500], ['xlarge', 1000]]) {
    await sharp(source).flatten({ background: '#fff' })
      .resize(size, size, { fit: 'contain', background: '#fff' }).png()
      .toFile(path.join(destination, `${name}.png`));
  }
  console.log('Prepared shared AC 5000 store photos; wireframe icons untouched.');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

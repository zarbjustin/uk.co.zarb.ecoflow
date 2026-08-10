'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const driversRoot = path.join(__dirname, '..', 'drivers');

function typescriptFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...typescriptFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(fullPath);
  }
  return files;
}

test('shipped drivers cannot bypass the shared Developer API write guard', () => {
  const bypasses = [];
  for (const file of typescriptFiles(driversRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    if (/\.client\.setQuota\s*\(/.test(source)) {
      bypasses.push(path.relative(driversRoot, file));
    }
  }
  assert.deepStrictEqual(bypasses, []);
});

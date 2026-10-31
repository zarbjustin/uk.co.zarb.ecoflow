'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { installMatchingCompatibility } = require('../scripts/lint.cjs');

test('patched development matcher retains the callable and named APIs used by legacy ESLint plugins', () => {
  const modern = require('minimatch');
  const matcher = installMatchingCompatibility();
  assert.equal(typeof matcher, 'function');
  assert.equal(matcher.Minimatch, modern.Minimatch);
  assert.equal(matcher.GLOBSTAR, modern.GLOBSTAR);
  assert.equal(matcher.minimatch, modern.minimatch);
  assert.equal(typeof matcher.makeRe, 'function');
  assert.equal(matcher.match, modern.match);
  assert.equal(require('minimatch'), matcher);
  assert.equal(installMatchingCompatibility(), matcher, 'idempotent in the lint process');
  for (const [path, glob, options] of [
    ['lib/a.ts', '**/*.ts', {}], ['.hidden/a.js', '**/*.js', { dot: true }],
    ['a.ts', '!*.js', {}], ['a/b.ts', '*.ts', { matchBase: true }],
    ['a/b.ts', '*.ts', {}], ['a.js', '**/*.{js,ts}', {}],
  ]) {
    assert.equal(matcher(path, glob, options), modern.minimatch(path, glob, options));
    assert.equal(new matcher.Minimatch(glob, options).match(path), new modern.Minimatch(glob, options).match(path));
  }
  assert.ok(matcher.makeRe('**/*.ts').test('lib/a.ts'));
  assert.equal(matcher.makeRe('**/*.ts').test('lib/a.js'), false);
  assert.deepEqual(matcher.match(['a.ts', 'b.js'], '*.ts'), ['a.ts']);
});

test('legacy import restrictions still allow and reject paths through patched matcher predicates', () => {
  installMatchingCompatibility();
  const { Linter } = require('eslint');
  const lint = new Linter();
  lint.defineRule('import/no-internal-modules', require('eslint-plugin-import').rules['no-internal-modules']);
  const verify = options => lint.verify("import value from './lib/EcoFlowClient';", {
    parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    rules: { 'import/no-internal-modules': ['error', options] },
  }, { filename: require('node:path').join(process.cwd(), 'compat.js') });
  assert.deepEqual(verify({ allow: ['**/lib/**'] }), []);
  const rejected = verify({ forbid: ['**/lib/**'] });
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].ruleId, 'import/no-internal-modules');
  assert.equal(rejected[0].fatal, undefined);
});

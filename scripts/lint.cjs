'use strict';

/**
 * Development process only. Legacy ESLint plugins call minimatch as a function;
 * the patched library exposes a namespace. Preserve their callable entry point
 * while keeping the patched implementation and its named/static APIs intact.
 * Nothing here is imported by the Homey runtime or modifies files on disk.
 */
function installMatchingCompatibility() {
  const entry = require.resolve('minimatch');
  const modern = require(entry);
  if (typeof modern === 'function') return modern;
  if (typeof modern.minimatch !== 'function' || typeof modern.Minimatch !== 'function') {
    throw new Error('Unsupported development pattern matcher');
  }
  const callable = Object.assign((...args) => modern.minimatch(...args), modern);
  // ESLint's import/no-internal-modules consumes only makeRe(...).test(path).
  // v11 removed RegExp generation; delegate that predicate to its patched
  // matcher rather than reintroducing the old regular-expression generator.
  callable.makeRe = (pattern, options) => {
    const matcher = new modern.Minimatch(pattern, options);
    return { test: path => matcher.match(path) };
  };
  require.cache[entry].exports = callable;
  return callable;
}

async function runLint() {
  installMatchingCompatibility();
  const { ESLint } = require('eslint');
  const lint = new ESLint({ extensions: ['.js', '.ts'], ignorePath: '.gitignore' });
  const results = await lint.lintFiles(['.']);
  const formatter = await lint.loadFormatter('stylish');
  const output = formatter.format(results);
  if (output) process.stdout.write(output);
  if (results.some(result => result.errorCount > 0 || result.fatalErrorCount > 0)) process.exitCode = 1;
}

module.exports = { installMatchingCompatibility, runLint };
if (require.main === module) runLint().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

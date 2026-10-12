'use strict';

// Local-only helper. Keep private input/output files outside the repository.
const fs = require('node:fs');
const { reassembleReportMessages } = require('../settings/reporter-status');
try {
  const files = process.argv.slice(2);
  if (!files.length) throw new Error('Usage: node scripts/reassemble-support-report.cjs part1.txt part2.txt ...');
  process.stdout.write(reassembleReportMessages(files.map(file => fs.readFileSync(file, 'utf8'))));
} catch {
  process.stderr.write('Could not reconstruct the report. Provide all complete parts from one capture.\n');
  process.exitCode = 1;
}

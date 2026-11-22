const test = require('node:test');
const assert = require('node:assert/strict');
const { DualCtDiagnosticEvents, dualCtEventSnapshot } = require('../.homeybuild/lib/dualCtDiagnosticEvents');
test('diagnostic event history bounds, coalesces, sanitises and handles clock reversal', () => {
 const e = new DualCtDiagnosticEvents(['accepted','stale']);
 for(let i=1;i<=40;i++)e.record(i%2?'accepted':'stale',i*1000);
 assert.equal(e.snapshot(40000).length,32);
 e.record('stale',41000);assert.deepEqual(e.snapshot(42000).at(-1),{reason:'stale',ageSec:1,count:2});
 e.record('PRIVATE',42000);assert.equal(e.snapshot(42000).length,32);
 assert.deepEqual(dualCtEventSnapshot([{reason:'stale',ageSec:1,count:1,secret:'PRIVATE'},{reason:'PRIVATE',ageSec:0,count:1}],['stale']),[{reason:'stale',ageSec:1,count:1}]);
 e.record('accepted',1000);assert.equal(e.snapshot(1000).length,1);assert.equal(e.snapshot(999).length,0);
});

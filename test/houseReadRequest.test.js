const test = require('node:test'); const assert = require('node:assert/strict');
const {houseReadRequest} = require('../.homeybuild/lib/houseReadRequest');
const {EcoFlowAppMqtt} = require('../.homeybuild/lib/EcoFlowAppMqtt');
test('read envelope contains header only and validates sequence', () => {
 assert.equal(houseReadRequest(1).toString('hex'), '0a0c102018207001ba0103617070');
 for (const n of [0,-1,NaN,1.5,0x80000000]) assert.throws(() => houseReadRequest(n));
});
test('read uses existing owned subscription, GET only, no offline queue or retained command', async () => {
 const app = Object.create(EcoFlowAppMqtt.prototype); const calls = [];
 app.handlers = new Map([['ES21SYNTHETIC0001', new Set()]]); app.userId = 'synthetic'; app.ended = false;
 app.client = {connected: true, publish: (topic, frame, opts, done) => { calls.push({topic, frame, opts}); done(); }};
 await app.requestHouseRead('ES21SYNTHETIC0001'); assert.equal(calls.length, 1); assert.ok(calls[0].topic.endsWith('/thing/property/get')); assert.deepEqual(calls[0].opts, {qos:0,retain:false});
 await assert.rejects(app.requestHouseRead('ES22SYNTHETIC0001')); app.client.connected = false; await assert.rejects(app.requestHouseRead('ES21SYNTHETIC0001')); assert.equal(calls.length, 1);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { flatten, buildSignBase, sign } = require('../.homeybuild/lib/sign.js');

test('flatten expands objects, arrays and object-arrays per EcoFlow rules', () => {
  const input = {
    name: 'demo1',
    ids: [1, 2, 3],
    deviceInfo: { id: 1 },
    deviceList: [{ id: 1 }, { id: 2 }],
  };
  const base = buildSignBase(input);
  assert.strictEqual(
    base,
    'deviceInfo.id=1&deviceList[0].id=1&deviceList[1].id=2&ids[0]=1&ids[1]=2&ids[2]=3&name=demo1',
  );
});

test('sign reproduces the documented golden vector', () => {
  const body = { sn: '123456789', params: { cmdSet: 11, id: 24, eps: 0 } };
  const base = buildSignBase(body);
  assert.strictEqual(base, 'params.cmdSet=11&params.eps=0&params.id=24&sn=123456789');

  const s = sign(body, 'Fp4SvIprYSDPXtYJidEtUAd1o', 'WIbFEKre0s6sLnh4ei7SPUeYnptHG6V', '345164', '1671171709428');
  assert.strictEqual(s, '07c13b65e037faf3b153d51613638fa80003c4c38d2407379a7f52851af1473e');
});

test('empty params produce a base-less canonical string that still signs', () => {
  assert.strictEqual(buildSignBase({}), '');
  const s = sign({}, 'ak', 'sk', '123456', '1700000000000');
  assert.strictEqual(typeof s, 'string');
  assert.strictEqual(s.length, 64);
});

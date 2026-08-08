'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const {
  decryptCertification, encryptCertificationForTest, certificationKey,
} = require('../.homeybuild/lib/appAuthCrypto.js');

// Deterministic, obviously-fake fixture values. No real credential is ever
// committed: the ciphertext below is derived from these at test time.
const TOKEN = 'test.jwt.token';
const PAYLOAD = {
  certificateAccount: 'fake-account',
  certificatePassword: 'fake-password',
  url: 'mqtt-e.ecoflow.com',
  port: '8084',
  protocol: 'mqtts',
};

test('certificationKey is SHA-256 of the token', () => {
  const expected = crypto.createHash('sha256').update(TOKEN, 'utf8').digest();
  assert.deepStrictEqual(certificationKey(TOKEN), expected);
  assert.strictEqual(certificationKey(TOKEN).length, 32);
});

test('decryptCertification round-trips an AES-CFB + PKCS7 payload', () => {
  const encrypted = encryptCertificationForTest(TOKEN, PAYLOAD);
  assert.notStrictEqual(encrypted, '');
  // The blob must not leak the plaintext.
  assert.ok(!Buffer.from(encrypted, 'base64').toString('utf8').includes('fake-account'));
  assert.deepStrictEqual(decryptCertification(TOKEN, encrypted), PAYLOAD);
});

test('decryptCertification matches an independently built ciphertext', () => {
  // Build the ciphertext with plain node crypto (aes-256-cfb + constant IV +
  // manual PKCS7) to prove the implementation, not just its own inverse.
  const key = crypto.createHash('sha256').update(TOKEN, 'utf8').digest();
  const iv = Buffer.from('ojsajkqjwk1w2dfg', 'utf8');
  const body = Buffer.from(JSON.stringify(PAYLOAD), 'utf8');
  const pad = 16 - (body.length % 16);
  const cipher = crypto.createCipheriv('aes-256-cfb', key, iv);
  cipher.setAutoPadding(false);
  const blob = Buffer.concat([
    cipher.update(Buffer.concat([body, Buffer.alloc(pad, pad)])),
    cipher.final(),
  ]).toString('base64');

  assert.deepStrictEqual(decryptCertification(TOKEN, blob), PAYLOAD);
});

test('decryptCertification tolerates a payload without PKCS7 padding', () => {
  const key = crypto.createHash('sha256').update(TOKEN, 'utf8').digest();
  const iv = Buffer.from('ojsajkqjwk1w2dfg', 'utf8');
  const cipher = crypto.createCipheriv('aes-256-cfb', key, iv);
  cipher.setAutoPadding(false);
  const body = Buffer.from(JSON.stringify({ certificateAccount: 'a' }), 'utf8');
  const blob = Buffer.concat([cipher.update(body), cipher.final()]).toString('base64');
  assert.deepStrictEqual(decryptCertification(TOKEN, blob), { certificateAccount: 'a' });
});

test('decryptCertification rejects a wrong token without leaking it', () => {
  const encrypted = encryptCertificationForTest(TOKEN, PAYLOAD);
  assert.throws(
    () => decryptCertification('another.jwt.token', encrypted),
    (e) => {
      assert.ok(/not valid JSON|could not be decrypted/.test(e.message));
      assert.ok(!e.message.includes('another.jwt.token'));
      assert.ok(!e.message.includes(encrypted));
      return true;
    },
  );
});

test('decryptCertification rejects empty input', () => {
  assert.throws(() => decryptCertification(TOKEN, ''), /empty certification payload/);
  assert.throws(() => decryptCertification('', 'AAAA'), /missing token/);
});

test('decryptCertification rejects a non-object payload', () => {
  const encrypted = encryptCertificationForTest(TOKEN, ['not', 'an', 'object']);
  assert.throws(() => decryptCertification(TOKEN, encrypted), /unexpected certification payload shape/);
});

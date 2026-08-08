'use strict';

import crypto from 'crypto';

/**
 * EXPERIMENTAL — EcoFlow app ("Portal") authentication crypto.
 *
 * The `/iot-auth/enterprise-development/user/certification` endpoint returns its
 * payload as a base64 blob encrypted with AES-256-CFB (full 128-bit segments),
 * keyed on SHA-256 of the login token and a constant IV, with PKCS#7 padding.
 *
 * Adapted from the MIT-licensed reference implementation
 * https://github.com/shuette42/ecoflow-energy-ha
 * (`custom_components/ecoflow_energy/ecoflow/enhanced_auth.py`).
 * See docs/EXPERIMENTAL_STREAM_AC5000.md for the full attribution notice.
 */

/** Constant IV used by the EcoFlow web/app bundle for the certification blob. */
const CERT_IV = Buffer.from('ojsajkqjwk1w2dfg', 'utf8');
const CERT_CIPHER = 'aes-256-cfb';
const BLOCK_SIZE = 16;

/** Derive the AES key for a login token. Exported for tests only. */
export function certificationKey(token: string): Buffer {
  return crypto.createHash('sha256').update(token, 'utf8').digest();
}

/** Strip PKCS#7 padding when it is present and well-formed, otherwise return input. */
function stripPkcs7(buf: Buffer): Buffer {
  if (buf.length === 0) return buf;
  const padLen = buf[buf.length - 1];
  if (padLen <= 0 || padLen > BLOCK_SIZE || padLen > buf.length) return buf;
  for (let i = buf.length - padLen; i < buf.length; i += 1) {
    if (buf[i] !== padLen) return buf;
  }
  return buf.subarray(0, buf.length - padLen);
}

/**
 * Decrypt and parse the encrypted certification payload.
 *
 * Throws a message that never contains the token, the ciphertext or any part of
 * the decrypted credentials — those values must not reach a Homey log.
 */
export function decryptCertification(token: string, encryptedBase64: string): Record<string, unknown> {
  if (!token) throw new Error('EcoFlow app auth: missing token for certification decryption');
  if (!encryptedBase64) throw new Error('EcoFlow app auth: empty certification payload');

  let plaintext: Buffer;
  try {
    const decipher = crypto.createDecipheriv(CERT_CIPHER, certificationKey(token), CERT_IV);
    decipher.setAutoPadding(false);
    const ciphertext = Buffer.from(encryptedBase64, 'base64');
    plaintext = stripPkcs7(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
  } catch {
    throw new Error('EcoFlow app auth: certification payload could not be decrypted');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw new Error('EcoFlow app auth: certification payload is not valid JSON after decryption');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('EcoFlow app auth: unexpected certification payload shape');
  }
  return parsed as Record<string, unknown>;
}

/**
 * Encrypt a certification payload the same way EcoFlow does. Used only by the
 * unit tests to build deterministic fixtures without embedding real ciphertext.
 */
export function encryptCertificationForTest(token: string, payload: unknown): string {
  const cipher = crypto.createCipheriv(CERT_CIPHER, certificationKey(token), CERT_IV);
  cipher.setAutoPadding(false);
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const padLen = BLOCK_SIZE - (body.length % BLOCK_SIZE);
  const padded = Buffer.concat([body, Buffer.alloc(padLen, padLen)]);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
}

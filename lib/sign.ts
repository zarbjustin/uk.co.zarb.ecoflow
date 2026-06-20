'use strict';

import crypto from 'crypto';

/**
 * Flatten a params object per EcoFlow's signing rules:
 *   { name:'x', ids:[1,2], obj:{ id:1 }, list:[{ id:1 }] }
 *   => name=x, ids[0]=1, ids[1]=2, obj.id=1, list[0].id=1
 */
export function flatten(value: any, prefix = ''): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  const add = (key: string, v: any) => {
    if (v !== null && typeof v === 'object') {
      Object.assign(out, flatten(v, key));
    } else if (v !== undefined) {
      out[key] = v;
    }
  };
  if (Array.isArray(value)) {
    value.forEach((v, i) => add(`${prefix}[${i}]`, v));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) add(prefix ? `${prefix}.${k}` : k, v);
  }
  return out;
}

/** Build the ASCII-sorted "key=value&key=value" base string from params. */
export function buildSignBase(params: Record<string, any>): string {
  const flat = flatten(params || {});
  return Object.keys(flat)
    .sort()
    .map((k) => `${k}=${flat[k]}`)
    .join('&');
}

/**
 * Create the HMAC-SHA256 signature (hex) over the canonical string:
 *   <sortedParams>&accessKey=...&nonce=...&timestamp=...
 */
export function sign(
  params: Record<string, any>,
  accessKey: string,
  secretKey: string,
  nonce: string,
  timestamp: string,
): string {
  const base = buildSignBase(params);
  const str = `${base ? `${base}&` : ''}accessKey=${accessKey}&nonce=${nonce}&timestamp=${timestamp}`;
  return crypto.createHmac('sha256', secretKey).update(str, 'utf8').digest('hex');
}

/** Build the required HTTP auth headers for a request. */
export function authHeaders(
  params: Record<string, any>,
  accessKey: string,
  secretKey: string,
): Record<string, string> {
  const nonce = String(Math.floor(100000 + Math.random() * 900000));
  const timestamp = String(Date.now());
  return {
    accessKey,
    nonce,
    timestamp,
    sign: sign(params, accessKey, secretKey, nonce, timestamp),
  };
}

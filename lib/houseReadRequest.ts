'use strict';

/** Read-only get-all envelope from ecoflow-energy-ha cd82685, MIT.
 * No pdata, command function/id, configuration or energy-stream switch.
 */
export function houseReadRequest(sequence: number): Buffer {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 0x7fffffff) throw new Error('Invalid read sequence');
  const vi = (value: number): Buffer => {
    let n = value; const bytes: number[] = [];
    do {
      let byte = n % 128; n = Math.floor(n / 128); if (n) byte |= 128; bytes.push(byte);
    } while (n);
    return Buffer.from(bytes);
  };
  const scalar = (field: number, value: number): Buffer => Buffer.concat([vi(field * 8), vi(value)]);
  const group = (field: number, value: Buffer): Buffer => Buffer.concat([vi(field * 8 + 2), vi(value.length), value]);
  return group(1, Buffer.concat([scalar(2, 32), scalar(3, 32), scalar(14, sequence), group(23, Buffer.from('app'))]));
}

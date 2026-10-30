/** Offline expanded-report assessment only. Never a decoder, admission gate or runtime dependency. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import profile from '../settings/dual-ct-contract.js';

const blocked = {
  energyEligible: false,
  hardwareValidated: false,
  firmwareQualified: false,
  intervalCoverage: null,
  intervalAccuracy: null,
  referencePolicyVerified: false,
};

/** Reports can establish arithmetic and reported packet association, never physical timing/accuracy.
 * This deliberately does not call the runtime single-payload checker on latest-field snapshots.
 * Only expanded historical snapshot schemas 3/4 are supported; no quote/array repair is attempted.
 */
export function reviewThreePhaseEvidence(report) {
  const snapshot = report?.reportType === 'dual_ct_comparison' ? report.candidateSnapshot : report;
  const reject = status => ({ ...blocked, status, devices: [] });
  if (!snapshot || snapshot.reportType !== 'dual_ct_candidate_snapshot' || ![3, 4].includes(snapshot.schemaVersion)
    || !Array.isArray(snapshot.devices) || snapshot.devices.length < 1 || snapshot.devices.length > 4) return reject('unsupported_snapshot');
  const indices = new Set();
  for (const device of snapshot.devices) {
    if (!device || !Number.isSafeInteger(device.deviceIndex) || device.deviceIndex < 0 || indices.has(device.deviceIndex)
      || !Array.isArray(device.readings) || device.readings.length > 64) return reject('malformed_snapshot');
    indices.add(device.deviceIndex);
    const fields = new Set();
    for (const row of device.readings) {
      if (!row || !Number.isSafeInteger(row.field) || fields.has(row.field) || typeof row.value !== 'number'
        || !Number.isFinite(row.value) || Math.abs(row.value) > 1000000) return reject('malformed_snapshot');
      fields.add(row.field);
    }
  }
  return {
    ...blocked,
    status: 'historical_arithmetic_review_only',
    historicalFlagPresent: snapshot.historical === true,
    notLiveFlagPresent: snapshot.notLive === true,
    devices: snapshot.devices.map(device => ({
      deviceIndex: device.deviceIndex,
      banks: profile.banks.map(bank => {
        const required = [bank.total, ...bank.power];
        const rows = required.map(field => device.readings.find(row => row.field === field));
        const missingFields = required.filter((field, i) => !rows[i]);
        const result = { bank: bank.bank, missingFields, arithmetic: 'incomplete',
          packetAssociation: 'unavailable', receiptAssociation: 'unavailable', opposingPhases: null,
          decodedZeroPresent: null, measurementCoherenceVerified: false };
        if (missingFields.length) return result;
        const [total, ...phases] = rows.map(row => row.value);
        const sum = phases.reduce((a, b) => a + b, 0);
        // Decoder-equivalent float32 arithmetic tolerance; not electrical accuracy.
        const tolerance = 0.001 + 0.000001 * (Math.abs(total) + phases.reduce((a, b) => a + Math.abs(b), 0));
        result.arithmetic = Math.abs(total - sum) <= tolerance ? 'consistent' : 'mismatch';
        result.opposingPhases = phases.some(n => n > 0) && phases.some(n => n < 0);
        result.decodedZeroPresent = phases.some(n => n === 0);
        if (rows.every(row => Number.isSafeInteger(row.packetIndex) && row.packetIndex >= 1 && row.packetIndex <= 2048)) {
          result.packetAssociation = new Set(rows.map(row => row.packetIndex)).size === 1
            ? 'same_reported_packet' : 'different_reported_packets';
        }
        if (rows.every(row => typeof row.receivedAgeSec === 'number' && Number.isFinite(row.receivedAgeSec) && row.receivedAgeSec >= 0)) {
          result.receiptAssociation = new Set(rows.map(row => row.receivedAgeSec)).size === 1
            ? 'equal_receipt_ages_only' : 'different_receipt_ages';
        }
        return result;
      }),
    })),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || fs.statSync(process.argv[2]).size > 1048576) throw new Error('invalid_input');
    const result = reviewThreePhaseEvidence(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
    // Whitelisted classifications only: never echo raw readings, identifiers, paths or exception text.
    console.log(JSON.stringify(result, null, 2));
    if (['unsupported_snapshot', 'malformed_snapshot'].includes(result.status)) process.exitCode = 1;
  } catch {
    console.error('Unable to assess input. Supply one expanded JSON snapshot (schema 3/4), at most 1 MiB.');
    process.exitCode = 1;
  }
}

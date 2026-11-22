# Dual CT completion review — 30 October 2026

## Firmware dependency update — 30 October 2026

[A native read-only firmware route has now been found and implemented](DUAL_CT_FIRMWARE_READBACK.md).
The missing-reader blocker described in this earlier review is superseded. Current-
package metadata matches the native observed firmware, but has no hardware timestamp.
Measurement/upgrade-cache qualification and Energy adoption remain open. The earlier
fingerprint and validation counts below describe that earlier UI review only.

## Outcome and limits

The monitoring UI cleanup is source-complete and locally verified. Normal CT1
Homey Energy adoption is **not ready**: no supported runtime firmware reader or
qualified model/firmware/timing contract was found. This is a specific source
qualification blocker, not a missing cumulative-Energy manifest or accounting
engine. Do not enable the driver or mark hardware gates passed to bypass it.

## Completed in this review

- Normal product name Smart Meter Dual CT and Receive meter readings setting in
  EN/DE/NL; concise connection/account/failure messages and explicit pairing limits.
- Explicitly clear the old persisted research warning using setWarning(null).
  No permanent research banner on healthy startup. Real availability errors remain.
- Preserve driver/capability IDs, existing paired names/customizations, consent,
  account binding, expiry, raw counters and all Energy/Flow/Insights boundaries.
  Existing paired names are not automatically renamed by a driver manifest edit.
- Regression covers an existing persisted banner, live readings, unchanged
  capabilities/settings/consent, no Energy writes and listener cleanup. Existing
  desktop/mobile consent and lifecycle checks continue to pass.
- Fresh read-only native and API checks; bounded 25-pair comparison with an owner-
  confirmed independent whole-property meter. Both sources showed import, with
  sampling differences. This is corroboration, not calibrated accuracy, export,
  true zero, interval accuracy or receipt/replay qualification.

## Source qualification findings

Native EcoFlow still reports V1.0.0.41. The current owned-device list reports
productType 421 but no firmware field. The supported Developer quota GET is
rejected with 1006 for this meter. Existing local app/firmware reference code
provides no demonstrated alternative firmware reader. Native screen evidence
cannot substitute for fresh source identity in the runtime context. No arbitrary
endpoint scan, firmware update, capture flag or hardware command was used.

Current source includes standard measure_power, imported/exported kWh and Homey's
cumulative/import/export mapping in a separate CT1 Energy driver. It remains
hidden/default off; its production resolver stays empty. CT2 is excluded.
Existing diagnostics are not silently converted into accounting.

## Finite route to the requested end output

| Stage | Deliverable / exit condition | State / authorization |
| --- | --- | --- |
| Source identity and measurement qualification | Supported current firmware readback plus evidence-backed CT1 W/sign/encoding and freshness/replay policy; register only the qualified scope | Blocked on the firmware-read path; import comparisons are partial |
| Normal Energy candidate | Normal pairing for qualified CT1, one property source, separate monotonic import/export totals, unknown/stale handling and no downtime backfill | Existing engine source-tested; production admission remains blocked |
| Owner candidate review | Exact source/CI/archive fingerprint, UI preview, preservation baseline, named source adoption/exclusions and rollback procedure | No installation, activation or source switch approved by this document |
| Installed native acceptance | Fresh import/export/zero and interval comparisons, real store/restart/upgrade/rollback plus desktop/mobile Energy visibility | Needs approved candidate installation and Energy adoption; any restart/hardware test separately scoped |
| Final acceptance | At least 48 hours on the exact adopted final runtime with continuity/freshness checks | Not started; cannot run meaningfully on the disabled Energy path |
| Delivery | Reviewed Test candidate, then separate production decision after acceptance | Test/Live unchanged; no publication authorized |

The end output is one authoritative CT1 property smart-meter contributor in Homey
Energy, with increasing import/export kWh, reliable signed watts and recovery,
normal product wording, and no permanent diagnostic warning. The optional existing
monitoring device keeps its identity/history. The current implementation uses a
separate Energy device; automatic in-place conversion is not implemented.

## Current preservation and baseline correction

Installed Development remains 1.10.62. Fresh readback preserves 13 EcoFlow device
identities, 99 Flows, 1201 Insights identities and eight nondecreasing counters;
no new broken Flow. No Energy or device settings changed between this turn's
first and final readback. Compared with the earlier restart baseline, the office
meter is excluded from Energy and no longer marked as whole-property, and the CT1
circuit description is now grid. These changes predate this turn's first readback;
their author is not established. Do not restore them automatically. The office
meter remains a nested submeter, never an additional property import source.

## Verification and evidence boundary

Committed-lockfile npm ci, Node 22, all 1178 tests, lint, release:check, pinned Homey
CLI 4.5.3 verified validation and git diff --check pass. Hardware-required readiness
must remain blocked. Source and manifest changes are local, not installed or
published. No version bump, commit/push or new exact CI run. Installed runtime
provenance remains 31c31c481516fa3c7ff4acd8ae75cd2bc9bf3f6121c7015b51ddee7c1ecd1545;
local runtime fingerprint is different and does not inherit installed passes.

Only sanitized findings belong here. Native/household values, identifiers,
private preservation snapshots and correspondence remain outside Git. No battery
settings/tasks, pairing, restart/reconnect, Flow execution or Energy write ran.

Local review fingerprint (uninstalled): `5947fba344484818c73fc93c49859ba67e23d3ef23b2fee884920b27b1c823af`.
All 1,178 tests, lint, release:check, pinned Homey 4.5.3 verified validation and diff check pass. No exact CI/archive or hardware readiness is implied.

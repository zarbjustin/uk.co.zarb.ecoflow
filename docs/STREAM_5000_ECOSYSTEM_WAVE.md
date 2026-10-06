# STREAM 5000 ecosystem wave

Implemented 6 October 2026 on `codex/stream-charging-coordination`; subsequently
merged into GitHub `master`. Release handover updated 7 October: this wave and
the original STREAM bug bash are published to **Test v1.10.22 / build 37**.
Exact-version CI and Homey validation passed; Test publication was confirmed in
the developer portal. See [release evidence](STATUS.md). Production remains
v1.10.3 / build 18. Hardware acceptance remains open; no live commands or
installation changes were performed as part of the release.

## Software integrated

1. **Freshness/reliability:** each live reading has its own bounded receipt clock.
   A temperature/configuration delta cannot refresh battery/grid power. The
   watchdog clears expired values to unknown, not zero; unknown frames still
   cannot make a silent battery available. Persisted live values clear on restart
   until observed again. Support schema 5 adds anonymous per-reading age and
   subscription/frame/telemetry/reconnect diagnostics. A registered subscription
   is not proof that the remote socket is connected. Connection guidance points
   to account settings rather than asking users to delete devices.
2. **Read-only settings:** separate custom capability IDs display reported mode,
   charge/discharge SOC limits, backup reserve, grid input/output limits. They
   are `setable: false`, not aliases of BK's writable settings. Existing devices
   gain them in place without changing identities/counters. Values refer to the
   subscription source, not proven whole-installation limits. Expired or missing
   values clear. Two conditions check reported mode/reserve-enabled state;
   missing/stale evidence throws, including for inverted conditions.
   Existing widgets consume the fresh reported mode/limits, honour reserve enable
   state and suppress stale power. Usable-energy/runtime estimates remain unknown
   if the reserve state or discharge floor is missing; installed capacity still
   requires the user's setting, not inferred pack counts or mAh.
3. **Observed physical accessories:** direct MPPT total/strings and backup-socket
   watts are added only to physical-unit monitors, on the first positive valid
   observation. Zero alone does not identify an installed accessory. Once added,
   a valid reported zero updates the tile. Existing tiles survive restart as
   capabilities, but no persisted power reading is presented as fresh. MPPT
   selection is serial-keyed; another unit's readings are never borrowed. Missing
   deltas preserve readings until expiry, not indefinitely. No new PV-to-socket
   sum, inferred third-party-solar tile or solar/grid kWh source is introduced.
   ES21 uses its explicit adapter and public masked linked capture regression.
4. **Accounting:** sample gaps exceeding the smaller of the device's configured
   unavailable interval and the shared one-hour integration bound re-anchor the
   next sample instead of backfilling stale power. Saved charged/discharged totals
   remain monotonic and unchanged by expiry. Existing socket/PV-flow/restart,
   duplicate-sample, private-identity and aggregate-only Energy tests remain.

No additional cloud request, authentication mechanism or control publisher is
added. Core telemetry parses and accessory admission remain model-registry-owned.

## Still not completed

| Work | Current boundary | Evidence required |
|---|---|---|
| Mixed-generation consolidation | Review hints only; no merge, SOC average or capacity sum | Stable membership/system identity, authoritative SOC/power, independent-installation negative case and reversible history/Flow migration |
| Control pilot | No 5000 writer or charging action | Model-specific safe limits, mode/scheduler ownership, zero/PV semantics, readback correlation, measured response and manual recovery |
| New product adapters | Expansion/3000/Gateway/Dual CT hints only; pairing stays closed | Actual prefix/identity, masked captures, field units/scope, host inclusion and hardware comparison |

The advisory coordination preview remains non-actuating and caller-state-owned.
It cannot enforce physical idle, determine surplus or arbitrate competing
controllers. Upstream scheduled-charge readback is not proof of actual charging
power. Do not turn a replay payload or research checklist into a permitted writer.

Public upstream captures/source are pinned in existing fixture provenance and
contract/model documents. No new official API endpoint or hardware observation
was discovered by this code increment. BMS mAh is not installation kWh capacity;
marketing names are not model admission.

## Owner acceptance before promotion

- Compare ES21 and ES22 separately with EcoFlow during charge, discharge, idle,
  direct PV daytime/nighttime and a normally used backup-socket load.
- Verify own-unit PV on linked units, zero/partial frames, silence and reconnect;
  inspect fresh temperature alongside deliberately missing power evidence in replay.
- Confirm no duplicate Energy sources, unchanged counters after restart and no
  backfilled outage energy. Capture a time series, not isolated screenshots.
- Compare configuration tiles/conditions with settings. Readback may be receipt-
  ordered rather than revision-ordered; the app does not claim command verification.
- Check new capabilities/conditions in the real Homey UI and a 24–48-hour soak.
- No wiring, grouping, meter removal, schedule overwrite or unverified control
  should be performed just to obtain research data. No re-pairing is required.

Test publication requires a separate explicit release decision. Hardware-dependent
sprints cannot be marked complete by passing local tests or CI alone.

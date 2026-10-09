# Reporting/topology regression and API audit — 9 October 2026

Work is on `codex/mixed-generation-reporting-diagnostics`, after Test
v1.10.24/build 39. This audit is not a new release, hardware acceptance, or a fix
for Robert's combined 0% reading. No runtime logic, grouping, driver IDs, control
gates, beta labels or account configuration were changed.

## Live read-only evidence

The owner's previously supplied Developer API credentials were loaded only into
memory. Device discovery, main-address lookup and quota reads were performed;
no setting/control writes or MQTT command publications were sent. Targeted quota
POST requests are reads, not the quota PUT write endpoint. No credentials, full
serials or raw account responses are included here or in test fixtures.

- Eight account devices: one BK01, one BK21, four BK31 and two BK61. No ES21/ES22.
- All six battery main-address lookups resolved to the same BK61 address. The
  meter also resolved there; that does not make it a battery member.
- Each battery's quota/all returned the same 15 field names: `backupReverseSoc`,
  `cmsBattSoc`, `cmsMaxChgSoc`, `cmsMinDsgSoc`, the intelligent-schedule and
  self-powered `energyStrategyOperateMode` flags, `feedGridMode`,
  `gridConnectionPower`, `powGetBpCms`, `powGetPvSum`, `powGetSysGrid`,
  `powGetSysLoad`, `quota_cloud_ts`, `relay2Onoff` and `relay3Onoff`.
- Microinverter and meter quota/all responses contained no quota fields.
- Targeted quota reads on a BK31 and a BK61 returned `cmsBattSoc` and the two
  relay fields, but not requested unit SOC/health, per-string PV, direct-PV-load,
  Schuko-power or PV-voltage fields. This is evidence about this route/account,
  not proof those readings cannot exist in app MQTT or on other installations.

Live queries cannot establish ES21/ES22 behaviour without an authorised account
containing them. Investigation is not limited to this account: the independent
sources below supply model-specific evidence, which remains distinct from our
own live observations.

## Documentation versus other implementations

The supplied [EU PP3 page](https://developer-eu.ecoflow.com/us/document/PP3?id=2058828605315256321)
was read afresh. It presents BK STREAM examples and main-SN system reads/commands
versus individual-SN sockets. It does not establish an ES21/ES22 mixed-generation
membership contract. Its quota examples match the live 15-field shape. Some field
descriptions are inconsistent (SOC/grid labelled as load); do not derive units or
scope from those descriptions alone. History dates are specified in UTC; the
cloud heartbeat field is not sufficient evidence of a timezone convention.

Two independent projects were reviewed at fixed revisions:

- [shuette42/ecoflow-energy-ha](https://github.com/shuette42/ecoflow-energy-ha/tree/12509ef6f198f57675a98872b08a870fc009943d)
  supports ES21 and ES22 through enhanced/app telemetry, separate from BK frames.
  Its [entity reference](https://github.com/shuette42/ecoflow-energy-ha/blob/12509ef6f198f57675a98872b08a870fc009943d/documentation/entities/stream-ac-5000.md)
  distinguishes system versus unit SOC/power and serial-attributed linked-unit PV.
  A neighbouring connection can carry a unit's PV records. That is useful
  attribution evidence, not a durable membership/expansion-capacity contract.
  The reference describes hardware-derived controls, but our readback,
  restart/reconnect, rollback and physical-response gates remain unchanged.
- [MichelFR/ha-ecoflow-iot](https://github.com/MichelFR/ha-ecoflow-iot/tree/45d9bb2952904cffa590cb811da0c316c66dd589)
  explicitly reports ES21/ES22 unavailable through its official Open API route
  (`1006`). Its [prefix catalogue](https://github.com/MichelFR/ha-ecoflow-iot/blob/45d9bb2952904cffa590cb811da0c316c66dd589/KNOWN_PREFIXES.md)
  is community/app-registry-derived, not an official model table. This explains
  why app telemetry support must not be represented as official API support.

Compared with the earlier shuette42 revision
`6f3c327fcd3bc2cdd22b7c006bb4d19607ef7e61`, the nine intervening commits did not
change the ES parser/fixtures/control contract. They did add original-STREAM PV3/4
voltage/current fields in [PR 523](https://github.com/shuette42/ecoflow-energy-ha/pull/523):
protobuf fields 998–1001. These are a follow-up candidate, not implemented here.
They require observed capability gating, receipt freshness and same-frame checks;
idle voltage alone must not imply a connected/producing panel.

No actionable independent 3000-series, gateway or expansion-battery pairing/API
contract was established in the reviewed sources. Do not broaden prefix admission
or reuse an ES22 control envelope for an unknown model. Product availability is
not sufficient to remove integration beta/read-only safeguards.

## New regression coverage

Seven synthetic tests supplement the existing ES21/ES22 parser, lifecycle,
accounting, freshness, reporting and topology suite:

1. A changed reporter address does not fabricate verified membership.
2. ES21/ES22 shared-peer overlap needs fresh evidence on both sides.
3. Returned peer objects cannot mutate tracker state.
4. Cached SOC after restart is not a new receipt or verified reporter.
5. Cached versus observed SOC disagreement remains visible in support JSON.
6. A cached main-address mismatch cannot silently reroute the paired read address.
7. Unit SOC and future-dated receipts cannot manufacture aggregate evidence;
   an actually received system zero remains zero.

These tests preserve the current diagnostic boundaries. They do not establish
that the saved main address is the right live installation reporter, repair a
stale capability value, substitute unit SOC, or sum possibly overlapping energy.

Local validation: all 409 tests passed; lint and `git diff --check` passed.
No version bump, upload, publication or hardware-control validation was performed.

## Next evidence and work

Await Robert's copied support snapshot, fresh app-log ID, concurrent screenshots
and original warning action/Flow. Do not send another request or ask for re-pairing.
Use receipt evidence and address comparison to decide whether the failure is
reporter selection, absent system fields, stale capability writes or attribution.

Next bounded candidates: original-STREAM PV3/4 diagnostics; serial-attributed
cross-connection ES PV tests; real mixed-generation reporter transitions; and
expansion/meter samples with exact model and transport provenance. Controls remain
separate hardware-gated work. A negative account read or a peer record must not be
turned into a claim about the entire product range.

## PV3/4 follow-up investigation

The reporting tests and initial audit were pushed as `8824265` on the diagnostic
branch. A subsequent investigation independently decoded the six public masked
samples in upstream
[bk_pv34_voltage_current.json](https://github.com/shuette42/ecoflow-energy-ha/blob/12509ef6f198f57675a98872b08a870fc009943d/tests/fixtures/stream/bk_pv34_voltage_current.json).
No owner serials or private frames were downloaded into the repository.

In status envelope `254/21`, fields 996/997 are the candidate string powers and
998/999 and 1000/1001 are their paired voltage/current readings. All six use
protobuf wire type 5 (32-bit little-endian float), without a milli-unit scale.
The complete BK61 property sample independently gives approximately 21.2286 W
and 39.3299 W; voltage times current matches both within floating-point rounding.
Partial property samples omit one or more components. BK11/BK61 get_reply
samples have materially different products from their reported watts, so those
replies do not establish simultaneous physical readings. BK12 idle readings
contain roughly 2.6 V but zero current/power, not evidence of connected panels.

The upstream parser itself still marks the physical PV3 versus PV4 ordering
unverified. Preserve that caveat until a labelled app screenshot/port test proves
it. Issue 522 also mentions BK31 alongside PV models: do not copy that admission;
our BK31 AC Pro definition is AC-coupled with no direct PV inputs. Restrict any
implementation to known model port counts (BK11/BK61 four, BK12 three), and do
not infer a fourth usable input merely because the firmware includes a field.

A fresh targeted POST quota read on an authorised BK61 requested `powGetPv3`,
`powGetPv4`, `plugInInfoPv3Vol`, `plugInInfoPv3Amp`, `plugInInfoPv4Vol` and
`plugInInfoPv4Amp`. None was returned. This repeats the transport limitation;
it does not invalidate the public app-telemetry samples.

Code-path review: original STREAM currently consumes official REST/JSON MQTT in
`BaseEcoFlowDevice`/`EcoFlowMqtt`. Its PV watts mapper already accepts named
voltage/current pairs, but has no original-BK binary app-frame decoder or separate
PV voltage/current tiles. The existing app transport is used by the ES devices.
Wiring ES parsing into BK would be incorrect: these are different envelopes.

Recommended implementation sequence, not implemented by this investigation:

1. Add a narrowly scoped read-only BK `254/21` decoder with field presence,
   finite/range checks, envelope/source attribution and synthetic regressions.
2. Route observed unit readings to physical STREAM Units only, using the existing
   app-account transport where configured. Keep REST-only installations working;
   Developer access/secret keys alone are not app-login credentials.
3. Expose model-limited diagnostic voltage/current readings with independent
   receipt freshness. Missing fields stay unknown, observed zero stays zero,
   stale persisted readings clear on restart/expiry. Voltage alone must not
   change panel-presence or generation status.
4. Keep directly reported watts authoritative. Do not recompute power or energy
   from independently cached voltage and current; a product is a same-frame
   diagnostic check only. Do not change Home Battery accounting or topology.
5. Validate physical port ordering with simultaneous app screenshots/known ports
   before removing the candidate mapping caveat or publishing new tiles.

No parser/capability changes, live control writes, release or merge were made.

### Subsequent implementation on the diagnostic branch

The recommended decoder and optional physical-unit voltage/current tiles are now
implemented locally (not in build 39). The earlier investigation-only statements
above describe their respective checkpoints. Runtime changes are confined to the
four diagnostic fields; no watts, solar total, battery or energy values are
produced by the decoder. Known models enforce port counts, receipt timestamps
are independent, zero is retained, future/out-of-order receipts are rejected,
and stale values clear after 20 minutes on a one-minute watchdog. Restarts clear
saved diagnostic values; late callbacks/subscriptions are generation-guarded and
teardown removes subscriptions/timers. REST-only installations remain functional.
Newly saving app-login credentials requires restart for this optional subscription.

Nine additional tests cover decoder limits, model/envelope/source attribution,
partial/zero/nonfinite/malformed frames, receipt clocks, lifecycle cleanup,
unchanged power/energy values, REST-only operation and fixed-list support JSON.
All 418 tests, lint and diff checks pass. The candidate port label stays visible
pending physical port validation. No live hardware settings were changed.

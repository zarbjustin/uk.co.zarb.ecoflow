# STREAM 5000 API review — Sprint 1 telemetry correctness

Review date: 3 October 2026. Implementation is local and monitoring-only; it is
not a release announcement or proof of live hardware validation.

## Evidence boundary

- [EcoFlow STREAM documentation](https://developer-eu.ecoflow.com/us/document/PP3?id=2058828605315256321)
  and [general API guidance](https://developer-eu.ecoflow.com/us/document/root?id=2058828162669383681)
  establish the supported Developer API approach and BK-series `mainSn` routing.
  This review did not establish an official ES21/ES22 protobuf contract, shared
  mixed-generation installation identifier, or equivalent ES22 Developer-key support.
- [ecoflow-energy-ha](https://github.com/shuette42/ecoflow-energy-ha/tree/0bf59ae71058562e8f8e95610b00c3c12fbaba07)
  is the community implementation reviewed at commit
  `0bf59ae71058562e8f8e95610b00c3c12fbaba07`. Its parser, state-application code
  and masked hardware captures supply evidence for the ES22 corrections below.
  These are observed app-protocol behaviours, not official API guarantees.
- The selected public captures are in `test/fixtures/stream5000Telemetry.json`.
  Provenance is embedded in that file; the MIT notice is retained in
  `EXPERIMENTAL_STREAM_AC5000.md`. No private diagnostic report was copied into
  these new fixtures. ES21 captures validate a shared flow edge only; the model
  remains outside this app's pairing allow-list.

## Rules implemented

| Area | Rule and regression evidence |
| --- | --- |
| System percentage | Home Battery uses `f11.5`. Linked capture: system 76%, source unit approximately 87.12%, second unit 65%. Never substitute a unit percentage or average the records. |
| Physical percentage | Use the source unit's `f33.6` or the matching serial entry in `f50`/`f54`, never the last entry encountered. |
| Legacy percentage | Keep the V1.1.4.35 single-record fallback, but only for a matching serial before system/peer evidence. Anonymous redacted fixtures can be decoded without a device context; live mapping requires identity. |
| Repeated records | Preserve every serial-keyed unit independently. Missing unit fields mean unchanged; malformed entries cannot overwrite their siblings. Observed record count is not a stable topology identifier. |
| Direct solar charge | Include `f12.2` (MPPT-to-battery) alongside `f12.9`. Capture: 308 W direct MPPT plus 130 W other solar charge gives 438 W, not 130 W. |
| Grid import | Include `f12.18` (grid-to-AC-socket). Loaded-socket captures give 554/558/553 W rather than approximately 200 W. An idle-socket unit remains at 200 W. |
| AC socket reading | Parse `f11.7` in half-watts, without adding a new public capability in this sprint. |
| Signed unit power | Do **not** infer direction from `f54.1.4`: a real discharge capture has system flow -536 W but unit raw power +534.5 W. Preserve the raw value internally only. `f50.1.4` is excluded because it latches at rest. |
| Physical power fallback | Retain legacy signed flow power only while no peer evidence exists. Once linked records appear, clear signed unit power/state rather than displaying aggregate power as one unit's share. No unit Energy meters are added. |
| Delta frames | Fill only the capture-verified idle edges when their parent group is present. An absent group supplies no new value. Known system/peer evidence remains latched within the mapper's device session. |
| Sanity limits | Separate defensive telemetry envelopes: 100 kW system and 10 kW unit. This accepts 18 kW installation telemetry; it does not claim a product rating or permit any control setpoint. Non-finite readings are rejected. |
| Availability | Only a non-null value applicable to the device's public role refreshes availability. Unknown frames, unit-only system deltas and invalidation-only frames do not. |
| Privacy | Serial-keyed records stay inside the parser/mapper. Diagnostic snapshots remain capability-allow-listed; raw diagnostic samples redact linked/header serials as well as the subscription serial. |

The last two scope guards are deliberately conservative. A legacy single-record
snapshot is not proof that the installation has only one battery; session
evidence resets on device restart. Stable persisted membership belongs to Sprint
2, not to an inferred protobuf field or serial list. When topology is uncertain,
do not advertise a precise signed per-unit result.

## Compatibility and accounting

Driver IDs, immutable pairing data, beta opt-in and stored kWh checkpoints remain
unchanged. These changes do not require a driver rename, re-pairing or deletion
of historical counters. Corrected power affects future local integration only;
past Energy/Insights totals are not rewritten. The installation Home Battery is
still the only Homey Energy contribution; physical monitors use custom power.

The source unit's BMS health/temperature remain source-unit measurements, not a
computed whole-installation health or temperature. No new control writes, REST
polling, model admission or automatic grouping is introduced.

## Remaining work / release gates

1. On Patrick's single AC 5000, compare charging, discharging, idle, percentage
   and cumulative kWh with time-aligned EcoFlow/Homey screenshots and a requested
   diagnostic snapshot. Verify existing counters survive an app restart.
2. On a linked installation, validate system percentage and each physical
   unit's percentage. Confirm ambiguous unit signed power is blank, not a copied
   system total or invented charging state.
3. On a socket-loaded setup, validate grid import. On a PV-capable setup, validate
   direct MPPT charging before admitting ES21 or adding PV/socket capabilities.
4. Complete a 24–48-hour soak with a reconnect and stale-data test before promotion.
5. Sprint 2: obtain mixed BK/ES installation evidence, stable group identity and
   membership; route one Home Battery per EcoFlow installation and suppress
   duplicate aggregates. Never group all batteries merely because they share an
   account, and never sum already aggregated system power.

Local gates: TypeScript build, lint, full tests including role/lifecycle replay,
and `homey app validate --level publish`. Store publication is a separate action.

Verification on 3 October: build, lint, all 217 tests and Homey publish-level
validation passed. The existing production dependency chain
`mqtt@5.15.1 -> socks@2.8.9 -> ip-address@10.3.1` has a moderate npm audit
finding. No package or lockfile changes were made in this sprint; the audit
finding must be resolved or explicitly reviewed before claiming the CI security
gate is green. Live validation and crash-report triage remain outstanding.

## Community development feedback reviewed on 3 October 2026

Reviewed all 27 public posts, including the subsequent replies to
[post 24](https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/24).
These are user reports, not reproduced defects or a supported API contract.

| Priority | Feedback and evidence | Development response |
| --- | --- | --- |
| P1 | [Ed, post 24](https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/24): v1.10.17, Homey Pro Early 2023 / OS 13.5.0, beta access enabled but both beta drivers missing. [Post 26](https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/26) reiterates the issue. | Both drivers exist in the current generated manifest, support the local Pro platform and are not deprecated. The setting gates entry to pairing; it does not dynamically register drivers. Do not call this fixed by telemetry changes. Obtain current installed build/channel, Homey mobile-app version, picker screenshots and diagnostics; compare packaged/live manifest with source before proposing removal or re-pairing. |
| P1 | [API 1006 report, post 14](https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/14) and follow-ups: device discovery succeeds but Developer-key telemetry is refused. | Distinguish permission/interface refusal from region or connectivity. Explain the opt-in app-account beta route and the Home Battery role; do not promise that switching regions fixes an unsupported interface. |
| P1 | [Ronald, post 27](https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/27): two choices, only the Home Battery contributes to Energy; asks for control. | Keep one installation Home Battery as the Energy source and make the optional physical monitor role clear. Preserve counters and identities during updates. Control support remains a separate, evidence-gated sprint, not part of this telemetry correction. |
| P2 | [Henry, post 15](https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/15): Ultra X with Tibber P1/prices and external Enphase rooftop solar; wants deliberate cheap/surplus charging and minimum charge/discharge power. | Audit existing BK Flow cards and their actual control semantics; document a supported automation recipe. Check whether minimum-power control is genuinely exposed before adding it. External solar cannot be assumed to appear as STREAM MPPT telemetry, and 5000 read-only beta controls must not be advertised as equivalent. |
| P2 | [Mixed-generation question, post 12](https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/12) is still unanswered in the public thread. | Request paired EcoFlow system/device screenshots and redacted diagnostics from a mixed original/5000 installation. Defer consolidation until membership and aggregate percentage/capacity semantics are established. |
| Validation | [Adri, post 17](https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/17), and [Sander, post 21](https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/21), report successful beta monitoring. | Use these volunteers for time-aligned charging/discharging/idle regression checks, rather than treating successful single-device monitoring as proof of linked or mixed-generation correctness. |

The public thread contains symptom descriptions but no crash stack sufficient to
attribute a crash to a code path. Developer-console crash reports need separate,
version-specific triage. Do not state that crashes have been resolved.

## Follow-up on 4 October 2026

All eight available build-18 manual reports have now been reviewed; the user
confirmed there are no further dumps. Seven show ES22 Developer API 1006 through
the wrong driver/interface. One contains an Energy calculation concern alongside
upstream/request timeouts; the calculation still needs numerical reproduction.
None establishes a process crash. Build 32 currently lists no reports.

The current [community feedback roadmap](COMMUNITY_FEEDBACK_ROADMAP.md) records
triage, live/test package evidence, unresolved picker behaviour and the remaining
hardware/topology/control gates. Setup guidance now names the installation Home
Battery correctly and explains why the beta switch cannot install missing app
versions or register device types dynamically.

The production dependency finding noted on 3 October was resolved with a narrow
`ip-address` lockfile update to 10.7.2. `npm audit --omit=dev` now passes with zero
findings. Thirteen high development-tool dependency findings remain outside that
production-only result and require a separately tested compatibility upgrade.

Follow-up verification: build, lint, all 220 tests, diff whitespace checks and
Homey publish-level validation passed. Lifecycle replay now checks restoring
saved charged/discharged totals, first-sample anchoring after restart, duplicate
timestamps and a two-hour reconnect gap. This is simulated lifecycle coverage,
not a hardware soak or proof of zero loss on an abrupt process crash; checkpoint
writes are coalesced and an abrupt termination may lose unflushed increments.
No version bump, commit/push or store publication was performed.

## Next-wave implementation — 4 October 2026

The development dependency findings above are now superseded by a tested
Athom-config 4.0.2 / ESLint 8.57.1 upgrade and lockfile refresh. A clean
`npm ci --ignore-scripts` and full `npm audit` pass with zero vulnerabilities;
CI now checks the full dependency tree. ESLint 8 is upstream-deprecated, retained
to meet Athom's current peer range rather than forcing a breaking major upgrade.

The accounting audit fixes initial BK baseline checkpointing, failed-store
retry, concurrent write serialization and pre-await snapshot consistency. Quota
processing uses receipt timestamps and rejects REST replies superseded by MQTT,
including queued/equal-millisecond races. Teardown drains accepted samples and
discards late REST results. Partial-counter authority and observed-decrease
policy are deliberately unchanged pending actual numerical evidence.

The local settings report exposes only allow-listed version/driver/beta state
and anonymous accounting counters. Its authenticated read-only GET follows
[Homey's Web API guidance](https://apps.developer.homey.app/advanced/web-api),
and the view uses the documented
[settings API](https://apps.developer.homey.app/advanced/custom-views/app-settings).
It does not call EcoFlow or expose account data, credentials, names or serials;
it cannot determine mobile-picker visibility or the installed store channel.

Build, lint and 242 automated tests pass, covering checkpoints, BK lifecycle,
REST/MQTT races, 5000 persistence, diagnostics projection and settings callbacks.
Homey publish-level validation and diff whitespace checks pass as well.
See [tester validation](TESTER_VALIDATION.md) and
[BK Flow audit](BK_FLOW_CAPABILITY_AUDIT.md) for the remaining hardware gates
and verified command boundaries. No process-crash fix, numerical Energy-report
resolution, automatic mixed-generation grouping or 5000 controls is claimed.
Driver identities, pairing and stored totals remain unchanged; no re-pairing is
required for this candidate. The changes are still local and unpublished.

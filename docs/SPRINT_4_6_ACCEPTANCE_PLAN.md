# Sprint 4–6 execution and battery acceptance

29 October 2026. Diagnostic development only; this plan is not permission to
install, adopt Energy, operate hardware or publish. The objective includes Dual
CT CT1 property Energy and explicitly scoped STREAM 5000 support. Every hardware
result must identify its installed runtime/model/role. The 48-hour period starts
on the final accepted candidate, not from an older installation or a software replay.

## Sprint 4 — qualified source and adoption

Diagnostic 1.10.59 wires a separate CT1 Energy driver, adoption UI, Homey
contributor inventory and owned subscription lifecycle around the persistent
session. Review/confirmation require fresh owned identity, firmware and complete
inventory; final Add rechecks the approved source before saving credentials.
The new driver stays hidden from Add Device, runtime false and contract registry
empty. A demonstrated supported firmware readback and physical W/sign/timing
qualification remain required. No client flag or native screenshot substitutes
for the provider. Code-owned synthetic injections prove wiring, not hardware.

Account Repair now supports existing app-connected devices without deletion or
new pairing; it preserves source identity and prior consent and verifies shared
credential writes. Native account Repair, failed/cancelled recovery and unchanged
counter/Flow/device readback are part of the final-candidate native workflow.

Finish qualification with existing transport evidence and near-time native /
independent grid comparisons. Establish direction in both directions, zero,
phase/units, sparse frames and buffering/replay behavior. Resolve the firmware
readback with a supported source or documented vendor evidence. Keep the planned
power integration explicitly approximate if receipt timing is the qualified route.
Do not invent measurement timestamps or equate a packet arrival with freshness.

## Sprint 5 — battery and meter matrix

| Area | Validation required | Present limit / next observation |
| --- | --- | --- |
| Identity and membership | Physical ES21/ES22 identity, native system membership, expansions versus peers, separate original/microinverter scopes | Owner ES21 admitted; linked physical scope remains unverified. Old original-family peer records cannot establish current membership |
| SOC and capacity | Near-time SOC, actual reported usable capacity/expansion scope, no unit-count guessing | SOC is visible; no new capacity/expansion acceptance or inferred missing battery |
| Battery watts/direction | Charge, discharge, true idle; distinguish DC pack from AC/system/GRID-port power | Physical watts/state withheld in linked scope. A fresh grid reading cannot substitute for battery power |
| Configuration | Mode, reserve enabled/target independently, SOC limits, grid input/output and socket settings | Read-only configuration arrives; no proof of electrical enforcement or control support |
| Freshness | Independent SOC/power/temp/config ages, 180-second battery expiry and five-second cleanup, retained standby hint horizon | Needs a naturally sparse interval on exact candidate; new receipts before expiry cannot pass it |
| Recovery | Natural receipt recovery, no old-field revival; later approved restart/reconnect and rollback | Fresh subscription is not recovery acceptance; no forced silence/network disruption |
| Accessories | Model-appropriate direct PV/string/socket data, own-versus-peer attribution, zero/nonzero/expiry | No acceptance from nighttime zero, unused sockets or another model's evidence |
| Installation Energy | One new aggregate per verified separate installation, signed power and matched-window kWh, no unit double contribution | No 5000 aggregate currently paired; opt-in stays off pending distinct approved trial |
| Legacy preservation | Existing IDs, capability/custom titles, daily tiles, all settings/Flows/Insights and cumulative counters | Capture full private baseline/readback around an approved non-clean update; counts alone are insufficient |
| Persistence | Persist-before-project, duplicate/gap boundaries, restart and restore/rollback counter continuity | Software regressions pass; native storage/backup acceptance remains open |
| Normal use | At least 48 hours, meaningful errors, subscriptions/freshness, legacy devices, counters and available natural states | Starts only on final installed/adopted candidate; synthetic soak is separate |
| Coverage | ES21 and ES22, unit monitoring versus installation Energy, linked/unlinked and accessories | Do not transfer owner ES21 results to ES22 or system-role acceptance |

New 5000 controls, remaining-time estimates, unsupported products and automatic
mixed-generation grouping remain outside this release claim. A narrower release
scope must be reviewed explicitly rather than marking unavailable hardware passed.

### Current read-only checkpoint

Owner installation remains Development 1.10.58 / da1da009…5baee1. Latest private
verification preserves 12 full device definitions, 99 complete Flows, app-setting
hashes and six nondecreasing cumulative sequences. Only ES21 identity and one
single-unit idle point are accepted for that runtime. New diagnostic 1.10.59
source, account Repair and CT1 driver are not installed or physically accepted.
No new hardware gate is promoted by source tests or cached readbacks.

### Historical 1.10.58 deployment proposal — completed with separate approval

Version 1.10.58 is a diagnostic candidate containing telemetry health and disabled
adoption preparation, plus earlier original STREAM fixes. An approved non-clean
Development update may expose the new frame-versus-accepted diagnostics without
activating Energy, pairing another device or issuing a battery command. Before
that action: preserve private full device/settings/capability/Flow/counter baseline,
review exact source/CI/archive/fingerprint and agree recovery. After: read back
the package/version and preservation baseline. That update was separately approved and completed. A new 1.10.59 update still
requires a fresh review/approval; native restart/rollback are separate actions.

Actual Energy adoption/exclusions and controlled charge/discharge require their
own reviewed bounds. Do not reuse the historical 500 W schedule approval on the
new topology. Agree circuit suitability, attendance, local stop, fallback cutoff,+limits and restoration before any such test; the old editor did not support a
ten-minute native task. Never silently substitute a longer scheduled test.

## Sprint 6 — exact source, package and release

`npm ci` on Node 22, full tests, lint, release/diff/audit checks and pinned Homey
verified validation establish software/package checks. `npm run release:full`
combines the Dual CT ledger and all STREAM 5000 model/role gates and must remain
nonzero while hardware evidence is missing or for another fingerprint. It does
not activate or publish anything and is not a replacement for software CI.

Only after qualified driver integration, native acceptance and soak: final source
review, exact CI/archive readback, approved Test delivery, reviewed Mainline
integration and certification/Live decision. No source push or successful archive
is a publication, owner installation or hardware signoff. Keep private evidence
outside the public repository and community messages draft-only.

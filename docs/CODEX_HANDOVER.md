# Codex cross-machine handover

## 6 November 2026 - Sprints 1-4 source candidate

Start with [SPRINTS_1_4_2026-11-06.md](SPRINTS_1_4_2026-11-06.md).
Baseline was clean/synchronized `9425da2bb6bb3ae636af354a02f881d0e498b6da`
on the existing diagnostic branch. Current sprint work bounds STREAM 5000
SDK backlog, expands lifecycle/freshness faults, preserves malformed/future
Energy checkpoints and actual source provenance, and guards new aggregate
pairing against observed overlap. Final review also exposed a retired poll
reviving a newly bound original STREAM; lifecycle ownership now fences it.
Held availability writes, including trial/rollback startup and quarantine, are
teardown-owned; retired availability continuations cannot emit a late online Flow.

Local candidate: **1,437 tests pass**, lint/release/diff checks, audit (zero
vulnerabilities) and pinned Homey 4.5.3 verified validation pass. All three final
independent reviews passed. Source commit/push and exact-commit CI remain pending
at this checkpoint; engineering is complete, private-history coverage is not.
Final receipt:
`../work/output/copilot-bug-bash-2026-11-06/sprints-1-4/FINAL_RECEIPT.md`.

Actual reviewers: `gpt-6-sol`, `gpt-6-astra`, `mai-code-2`; the precise
MAI-Code-2.x1 Preview mapping is unavailable. Trusted-local private-history
semantic review remains blocked. Aggregate scope is not certified disjoint;
no cross-session reservation or permanently stalled SDK cancellation is claimed.
The report records one rejected synthetic sign-in request caused by a missing
test stub; the corrected test mocks that path. No household credentials,
settings, controls, installation, Store Test/Live or Mainline changes occurred.
Hardware/native workflow acceptance remains open and separately authorized.

## 6 November 2026 - bounded offline bug bash

Reviewed source commit: `bc184ab190d130c393d8012353d4b570a8449699`.
[Exact-commit CI run 381](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/42138726870)
**passed**, including audit, at 00:43:30 UTC. This final checkpoint commit only
updates documentation; its own final SHA/CI and lease release/knowledge refresh
are recorded in the external receipt without another Git documentation loop.

Read [BUG_BASH_2026-11-06.md](BUG_BASH_2026-11-06.md) before older checkpoints.
Baseline diagnostic-branch HEAD was `d21ffa9b39f3d2462caa2584c6bf9a92a3bbf896`,
with clean tracked/untracked state and no remote divergence. Reviewed fixes
protect cached REST/MQTT reconciliation, coherent Energy restart, whole-system PV
scope, and STREAM 5000 delivery age/epochs/retired work. Final local suite:
**1,405 passing**, lint, release boundaries, diff check and pinned Homey 4.5.3
verified validation passed. Final audit retry hit registry infrastructure errors;
exact-commit CI is independent and recorded with the final external receipt.

GPT-6.1 Sol and GPT-6 Astra independently reviewed public source; Opus 5.5 was
unavailable, not substituted. Private-history semantic review was not possible
without a trusted local process. Unbounded SDK telemetry backlog remains open.
The report records the final-review scope-latch disagreement and its source-led
resolution. Full three-model/private-history/hardware acceptance is not claimed.

Resume from the actual checkout and
`../work/output/copilot-bug-bash-2026-11-06/FINAL_RECEIPT.md`, not hidden chat memory.
Installed Homey, Mainline/master, Store Test/Live and automation were untouched.
Older deployed-state claims below are dated history, not freshly verified state.

## GitHub CI follow-up — 2 November 2026 22:36 GMT

Both initial source commits were pushed and branch tips verified: HomeyPro
`997c52e` on `master`, STREAM `4b13c48` on its existing diagnostics branch.
[HomeyPro CI run 44](https://github.com/zarbjustin/HomeyPro/actions/runs/41537797732)
passed tests and security, then failed the preserved frozen-backup parity gate.
Its dependency audit was skipped after that failure; no parity waiver was applied.

[Initial STREAM CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41537800900)
exposed a timing error in the synthetic house test fixture: its topology getter
created a new receipt timestamp after the snapshot had sampled its clock, making
that peer appear to be from the future. This also entered an unconfigured mock
refresh path. The fixture now captures its receipt timestamp when constructed,
and a monotonically advancing millisecond-clock regression covers the boundary.
No production control/freshness check was weakened. Follow-up local validation
passes **1,393 STREAM tests**, lint and release-boundary checks. Production app
source and installed runtime hashes are unchanged by this test-only correction.
The follow-up CI result belongs to the follow-up commit; inspect its Actions run
rather than treating the initial run or local test pass as an exact-commit CI pass.

The source-sync handover remains the entry point below. Paused tasks, private
evidence and all Homey settings/Flows remain unchanged by this GitHub work.

## 2 November 2026 — GitHub source sync and consolidated handover

Start with [HANDOVER-2026-11-02.md](HANDOVER-2026-11-02.md). It records both active
branches, the last observed deployed state (18:13 GMT), exact runtime hashes,
source-only queue diagnostics, fresh offline validation, private continuity and
the ordered next checks. This sync does not refresh live observations or authorise
new controls, task resumption, releases or deployments. HomeyPro frozen-backup
parity remains a known 12-card failure; its evidence and CI gate are unchanged.

## 2 November 2026 18:13 GMT — final cheap/expensive cycle audit and attended two-member repair

Current resident house execution is enabled, unbroken and fault-free at policy
revision 12. At 18:13 fresh installation readings showed 4% SOC, reserve 0%,
about -1.04 kW supplying local load and zero grid charging. The native lease was
completed. One active Homey reserve writer remains: the coordinated execution
runner; legacy Agile/Dump Load reserve cards are delegates and the observation
Flow stays disabled. Codex watcher/archive/backup tasks remain paused. Office
scheduled control remains disabled pending its separate supply confirmation.

The readiness recursion correction described at 17:39 is installed. A second
forecast correction explicitly uses whole-property house CT1 demand: office net
imports are not subtracted while office planning is disabled. House-only forecast
transport no longer depends on the office meter or office Insights. The prior
separate provisional 0.50 + 0.15 kW missing-hour baselines were explicitly summed
to 0.65 kW, not described as measured demand. Native settings, charging limits,
95% house readiness and the office 10% policy were not changed by this migration.

Attended validation exposed additional multi-member issues rather than proving
the first source update sufficient. Native aggregate SOC can age between changes,
and a first reserve ACK can precede a delayed older member status reply. Immediate
watchdog handoff then sees disagreement and stops a valid charge. Controller-only
restoration also failed to prove both physical members stopped. Earlier failure
receipts, the restoration fault and intermediate archives are retained privately.
Only the fault created by this session's attended test was reviewed for recovery;
its original lease is preserved privately and recorded in maintenance history.
No historical/manual/office/heating fault was cleared.

The installed private bridge now checks and targets every explicitly enrolled
physical member separately when a reserve change/restoration is needed, never
unreviewed devices. It preserves a member's unexpected manual target. Group write
verification requires sixteen consecutive half-second agreeing polls before
releasing the command owner to the native watchdog; stale receipts are refreshed
without replaying SET. The acknowledgement path remains wall-clock bounded at
45 seconds at loop entry (one bounded read may finish after that deadline).
Restoration also handles a controller already restored while the
second member still needs its owned stop. A generic guard-loss stop records its
reason rather than appearing as an unexplained completed lease.

For private execution only, when aggregate SOC is stale, fresh (<=10 second)
exact-member SOC readings supply their minimum as an explicitly labelled lower
bound. This is neither an averaged system SOC nor a replacement Homey capability,
physical watt tile or Energy reading. The original aggregate SOC age remains
separate. Missing/stale member SOC, topology, power, native configuration or identity
still blocks. Signed power/grid-charge receipts remain independently fresh and
system-scoped, consumed once. This supports planning and charging from empty and
between sparse nonzero aggregate updates without pretending the aggregate refreshed.

Final attended cycle: sustained approximately 4.9–5.0 kW grid charging, around
6.1 kW whole-Space import below the retained 7.2 kW ceiling; both fresh member SOCs
increased. The first fresh pre-charge receipt was 3%/2%, later 4%/3%, and both were
4% after stopping. Explicit stop restored both reserves to 0%, charging fell to
zero, native expiry completed, and local-demand discharge resumed. No office
control command or CT1/feed-in/output/grid-limit write was sent. The scratch
commission script's original pass flag was false: it took persisted pre-refresh
SOC as its baseline and missed the last SOC packet at its charging-loop deadline.
A separate evidence review passed against the first fresh exact-member receipt
before positive grid charging, sustained power, SOC rise and completed stop/expiry.
Both the original result and the reviewed derivation remain preserved; do not
silently relabel the original script as a pass.

Final installed non-clean Development 1.11.20 archive SHA256:
`33457061b26f8a28ae6e3b23d1ccc6b8ff7a36448ce435df5cdad0bca0414667`.
Final resident execution source SHA256 (read back exactly):
`4bcf7ceca1ff7959ab2890b381ee52e1a9f46abc8e81a2854628aaf2c8d48b6b`.
Validation: 454 HomeyPro tests/security/whitespace, 1392 shared STREAM tests,
1390 isolated installed-package tests, lint, release-boundary checks and verified
Homey packaging passed. Public monitoring/CT1/soak acceptance gates remain open;
this is acceptance of the scoped private control cycle, not blanket app acceptance.
No Git commit/push, Store publication, clean install or device re-pair occurred.
Unrelated working-tree changes were preserved and excluded from the runtime package.

Fresh 18:13 conditional 19:00-rollover replay used 168 house-history points, no
office-history reads, current rates through 3 November 23:00 and projected 0% at
rollover. Proposed charging: a small 0.15 kWh top-up within 22:30–23:00, full rate
23:00–00:30, then 13:00–14:00 on 3 November (about 32.04–33.75p/kWh). It forecasts
12.45 kWh grid charging for GBP 4.08, morning higher-price supply around
06:30–09:00, and 95% before the 16:00–19:00 peak. The horizon closes with about
4.47 kWh still stored; its truncated net metric includes wear and does not credit
that stock, so it is not a full-bill profit/loss result. This replay is conditional,
not a prematurely committed overnight plan: the live provider rolls at 19:00 and
replans against actual SOC, ownership and flags. Full overnight delivery and
billing savings have not yet been observed.

Preservation readback passed: all 15 EcoFlow device definitions, 10 monotonic
counters, Insights identities, unrelated Flows and native boundaries. House has
10 kWh installed planning capacity, conservative 4.9 kW charging, owner-confirmed
7.2 kW shared Space ceiling and 2.5 kW output assumption; house floor 0%, office
floor 3%, office legacy allowance 2.8 kW remain. Undelivered batteries stay planned.
Frozen backup and Master cursor hashes remain unchanged; old parity evidence stays
untouched. Native settings/manual changes continue to take precedence.

## 2 November 2026 17:39 GMT — conflict audit and cheap-to-expensive cycle correction

Read-only live audit found one active Homey reserve writer: the coordinated
execution runner. The legacy Agile planner/watchdog and Dump Load reserve cards
are delegates with no competing reserve write. Remaining office feed-in guard
cards preserve the owner's choice, and the 07:30 daily report returns the
coordinated-state report while execution is enabled. The observation-only Flow
remains disabled. No additional referenced or unreferenced HomeyScript reserve
writer was found. Both native member mode/task/limit receipts remain checked by
the scoped bridge. This is Homey-visible ownership evidence, not a guarantee
against future external/manual native-app changes; those still inhibit control.

Physical expensive-period operation verified: after holding the shared reserve
at 14%, the runner stepped it down to 6% at 17:00 and released to the retained
0% floor at 17:30. At 17:17 fresh system power was about -2.47 kW (61.73p/kWh
current tariff); at 17:35 it was about -2.21 kW with 4% system SOC, reserve 0%,
zero grid charging and no execution/native fault. Homey's Octopus current price
matched the configured direct Agile feed in the audit. Negative battery flow is
local-demand supply, not forced grid export; CT1 anti-export remains unchanged.

The offline 19:00-rollover replay exposed a planning defect: taking the maximum
of readiness stock and later higher-priced demand did not reserve both when that
demand occurred before the readiness deadline. Additional cheap replenishment
could then free energy for a lower-priced interval, preventing a profitable
pre-peak cycle. The house backward recursion now imposes readiness stock AT the
service boundary, after processing that interval's demand/PV/charge, then carries
that stock together with earlier higher-price demand through actual replenishment.
It does not change the owner's 95% readiness target or the office dispatch policy.
Two regression tests failed before the correction and passed afterward: direct
stock accounting, and a chronological cheap-charge/expensive-discharge/refill
cycle that retains 95% readiness and energy conservation. Quantized surplus may
serve cheaper load only after the more valuable forecast demand is covered.

451 HomeyPro tests, security and whitespace checks passed. Updated execution,
observation and both existing preview sources were deployed/read back in place;
execution policy revision is 11. The short source update sent no native reserve
command and preserved fault/intent history. Current-peak behavior has no readiness
stock deadline and is unchanged by the correction. No EcoFlow app installation
was performed in this audit; installed Development 1.11.20 remains the prior
`de667c56d0faaf3a299bb70525acc79ad9875adecd2c652ea6550e707ee76a16` archive.
New execution source SHA256:
`a016c0d2576f2bf0fcc711e743e34cef99ffffbb9632d84e06994c76b2e72dcd`.

Conditional rollover replay, using published rates through 3 November 23:00,
projected 0% SOC at 19:00 and only demand history completed before actual capture:
a small 0.15 kWh top-up in 22:30–23:00, full-rate 23:00–00:30, then 13:00–14:00
on 3 November; prices approximately 32.04–33.75p/kWh. It serves the higher-priced
06:30–09:00 demand, refills and projects 95% before the 16:00–19:00 peak. About
12.45 kWh / GBP 4.08 charging includes the extra morning cycle. This is NOT an
already committed live overnight plan: the resident provider rolls from today's
remaining peak to tomorrow after 19:00, then replans against actual SOC/ownership.
The replay assumes no intervening manual/Free/Dump Load/Saving Session change.

Reporting limitation: the 19:00 horizon ends with about 5.46 kWh stored. Its horizon
net metric (including modeled wear) does NOT credit that retained energy, so neither its negative truncated
horizon metric nor the charging cost alone is a full-bill profit/loss statement.
Future-period value and physical billing reconciliation remain unproven. Do not
present a preview, a target or an ACK as completed overnight delivery/savings.

10 kWh installed house capacity, measured conservative 4.9 kW planning rate,
owner-confirmed 7.2 kW shared House Space ceiling, 2.5 kW house output assumption,
house 0% / office 3% minimums and all manual/office safeguards remain. Office
scheduled control still requires its own supply confirmation. Codex watcher,
archive and backup tasks remain paused. No new monitor, Store publication, Git
commit/push, device/Insight/counter change or historical-fault clearance. Full
night-through-next-peak physical acceptance remains pending. Frozen backup and
Master watcher cursor hashes are unchanged; the 12 old source-parity gaps remain
preserved. Latest preservation check passed for all 15 EcoFlow device definitions,
10 monotonic counters, Insights identities, unrelated Flows and native boundaries.

## 2 November 2026 16:36 GMT — two house units enrolled; shared 7.2 kW ceiling verified

Owner confirmed the newly paired STREAM 5000 is a second physical battery in the
same EcoFlow House Space, and explicitly confirmed setting Max Power from Grid
to 7200 W for that whole Space. Both ES21 units are now explicitly enrolled;
private Homey identities/serials remain outside Git. Planning capacity is 10 kWh
(two installed 5 kWh units). Undelivered AC 5000/expansion entries stay planned
and uncounted. Model family/capacity cross-check: https://www.ecoflow.com/uk/stream-series-solar-battery-storage

Adding the unit invalidated the old unit-power scope and the runner's single-
paired-driver assumption; the prior lease expired safely and released reserve.
The repair now consumes the existing controller's system SOC and signed system
flow once, from a private identity-bound installation receipt. It never adds
unit tiles or averages their SOCs, uses array order as identity, or copies system
watts into physical tiles/Energy. The existing aggregate and all device identities,
Insights/counters remain. Public physical-monitoring sign/scope acceptance remains
separate and open; linked unit watt tiles are not execution evidence.

Enrollment binds both Homey IDs and serials, corroborates their exact live peer
membership, and checks fresh native configuration on both. Additional/missing/
changed members, divergent reserves, manual changes on either unit, stale SOC,
system power or grid-limit fields inhibit control. Group requests and each lease
carry the exact member list; stale callers and unleased direct group writes are
rejected. Polling refreshes independently ageing member SOC and max-grid-input
configuration, even while other packets remain fresh. Native expiry verifies
both restored reserves and fresh post-stop grid-charge evidence. Solar charging
alone is not mistaken for excessive grid charging.

The reviewed House Space ceiling is applied ONCE: private gate
houseSiteChargeKw=7.2 / houseSpaceGridLimitW=7200. The legacy office allowance
siteChargeKw=2.8 is retained separately. No native grid/output/feed-in/CT1 setting
was written. Both native input limits still report the owner's 7200 W; shared
house output/discharge assumption remains the owner's existing 2500 W. The native
watchdog stops/latches charging if the house battery-charge allowance or whole
reported Space grid-import ceiling is exceeded. Member manual changes remain
authoritative during restoration; no generic automatic fault clearing is added.

Attended no-charge reserve probe confirmed one main-controller target reaches
both units and native expiry restores both. Attended charge test 16:28–16:31
then showed approximately 5.0 kW combined battery charging, approximately 6.0 kW
reported total Space import, SOC increases on BOTH reported physical members,
and verified stop/0% reserve restoration across both with no native fault.
The conservative measured planning charge rate is 4.9 kW; 7.2 kW is a ceiling,
not a claimed measured charging rate. Source receipts and every intermediate
before-state remain ignored/private, including the earlier failed/inhibited starts.

Execution policy revision 10 is enabled, with house grid charging enabled and
house-only scope retained. House readiness 95% / floor 0%, office readiness 10%
/ floor 3%, owner feed-in choices and CT1 anti-export are retained. At 16:33 the
fresh plan held the shared reserve at 14%, scheduled no expensive current charge,
and retained energy for later peak slots. At 16:40 the fresh installation receipt
confirmed 14% system SOC, shared reserve 14%, 0 W system battery flow and 0 W
grid charging, with healthy routine lease renewal and no execution/native fault.
Preservation targets are capped by the
lowest fresh member SOC so a hold cannot force the weaker unit to recharge at
peak prices; the stronger unit may supply its excess above that common target.
The old one-unit forecast is invalidated. A complete overnight charging/peak
cycle with both units is still unobserved; do not claim long-term acceptance.

Office scheduled control remains disabled pending its OWN supply-capacity
confirmation; the house 7200 W confirmation does not approve office resumption.
Native office minimum-reserve maintenance was observed independently of the
paused office automation. Do not silently change its native floor or mode.
Codex watcher/archive/backup tasks remain paused; no duplicate monitor was added.

Installed isolated non-clean Development 1.11.20 archive SHA256:
`de667c56d0faaf3a299bb70525acc79ad9875adecd2c652ea6550e707ee76a16`.
Resident execution runner exact readback SHA256:
`a4ef3da94d8ebf385417899275499264121e296899f9dbf2e2042066d1d651ed`.
Observation and both existing preview scripts were updated in place to the same
identity-bound telemetry contract; no new or re-enabled observer Flow was added.
Unrelated shared diagnostic edits remain preserved and excluded from the archive.
Validation: 449 HomeyPro tests, 1384 exact isolated-app tests and 1386 shared
STREAM tests passed, along with lint, release-boundary checks, pinned CLI verified
validation, HomeyPro security and whitespace checks. General hardware release gates
and 12 frozen-backup source-parity mismatches remain open/untouched. Preservation
readback at 16:36 passed for 15 device definitions, 10 monotonic counters, Insights,
unrelated Flows and native settings outside the explicitly reviewed house gate.
No Git commit/push, Store publication, re-pairing or counter reset was performed.

## 2 November 2026 15:20 GMT — house-only control dependency repair deployed

This checkpoint supersedes the earlier overnight restoration claims. Actual
history proves the 03:30–04:00 house charge reached 24%, but an unconditional
native office-stop check blocked the 04:30 higher target. The native watchdog
restored house reserve to 0% at 04:36; a new attempt failed the same office check
at 04:37 and latched execution. House SOC reached 0% around 06:05; later slots
were missed. The 95% objective was NOT achieved. Planner-only office exclusion
was insufficient: native command, restoration and freshness paths still depended
on office. Tests had not covered that complete transition with office excluded.

The repair adds explicit `controlScope: house-only` on the private scoped gate,
on each native lease and on verified transport receipts. The resident runner
requests `houseOnly: true` only when office execution is disabled. Scope must
agree in the app and runner; stale/mismatched callers cannot re-enrol office.
House-only reads require actual fresh house packets and report officeFresh=false
/ officeRequired=false. They do not read office hardware or invent office data.
House-only target changes, lease renewal and expiry do not call office stop/read
or write office settings. The planner/observer/coordinator also exclude disabled
office observations, commands and freshness requirements. Active coordinated
leases cannot be adopted as house-only; transition requires reviewed quiescence.
Coordinated mode retains existing stop-office-first, verified house no-discharge,
physical stop, freshness, power-budget and manual-ownership safeguards.

The known 04:37 fault and uncertain intent were archived before explicit review;
the completed native restoration and current 0%/3% baseline were checked. The old
intent was NOT replayed. Config is policy revision 7, house-only execution enabled,
office execution and planner charging disabled. No allowance increase: office
full-fleet 3.33 kW still exceeds declared 2.8 kW. Owner confirmation of supply
capacity remains pending before office re-enablement. House native output 2500 W,
CT1 anti-export, feed-in ownership, modes, limits and manual choices are retained.

Installed isolated non-clean Development 1.11.20 archive SHA256:
`e0db5e9ae3b4ce2b03f9c5c3d6a27524fcf94d9b589c7b811897c92212a76e17`.
Resident runner exact readback SHA256:
`01021823f0d8c46270296cc31cbe5efecf40026f190c10e2b1724d49aaffa138`.
Unrelated shared diagnostic edits were excluded from the installed archive.
No Git commit/push, Store publication, re-pairing, new Flow or counter reset.

Attended physical test 15:16–15:19 passed: actual ~2.5 kW charge, SOC 0→1→2%,
a higher house target accepted, charge power then 0 W at target, and a one-off
30-second native lease expired restoring house reserve 0%. Office remained 3%
and no office command was sent. Routine execution resumed at 15:19 with fresh
forecast: remaining charging to 16:00 projects ~34.1% SOC, ~GBP 0.74 further cost,
and explicitly reports readiness shortfall. This cannot recover the missed 95%
target today. At 15:30 the unassisted scheduled target change from 11% to 34%
was acknowledged and read back, with physical charging continuing at ~2.5 kW,
SOC 11%, office reserve 3%, and no execution/native fault. This directly exercises
the higher-target transition that failed overnight. A full scheduled day, future
peak delivery and general release acceptance remain unproven. Do not turn this
bounded commissioning and transition proof into a long-term stability claim.

Validation: 441 HomeyPro tests; 1374 tests on the exact isolated installed STREAM
source; the final shared STREAM tree also passed 1376 tests. Lint, release-boundary checks, Homey CLI 4.5.3 verified validation, HomeyPro
security and whitespace checks passed. The 12 existing frozen-baseline embedded
script parity failures remain evidence; none was replaced. Preservation readback
found 14 device definitions, 10 monotonic counters, Insights and unrelated Flows
unchanged outside reviewed scope. Private evidence remains ignored; frozen backup
and Master cursor are preserved. Codex watcher/archive/backup tasks remain paused.

## 2 November 2026 01:47 GMT — office fleet power mismatch; house-only scheduling restored

This checkpoint supersedes the deployment/state claims in earlier entries below.
The real 01:30 scheduled office start charged all six units and reached about
3.33 kW, exceeding the configured 2.8 kW shared battery-charge allowance. The
watchdog correctly requested office reserve 3%; the previous resident runner
mistook its in-progress native stop for an ownership change and latched a fault.
The smaller attended subset test did not establish full-fleet power requirements.
Do not describe the complete house/office installation as stable or accepted yet.

The native stop completed fault-free at approximately 01:34 GMT, with house
reserve 0%, office reserve 3%, and explicit physical-member noncharging evidence.
The known owned fault was explicitly reviewed against the exact completed lease
and current reserves; its full before-state and historical fault were preserved.
No generic or automatic fault clearing was introduced. The runner now recognises
an exact owned watchdog stop in progress and sends no new commands until it ends.
Unknown/manual changes and native stop failures still block execution.

Installed isolated non-clean Development app archive SHA256:
`7504649e51057f1950ceb4d08eabbbd34ef1d66234c7c5cf620f7f5063fde3e0`.
Resident runner exact readback SHA256:
`580be7500846064cd15442b7f3e11d3ce0fcd0cef99dc52de5c35f0fd07ea789`.
The native maintenance-loss proof allows at most 150 W only with all six exact
physical members reporting noncharging, net member power <=0, applied readings
<=90 s old and received after the stop anchor. It also requires three independent
fresh aggregate/balance receipts over >=6 s, reserve 3%, self-powered mode and no
alarm. This distinguishes AC conversion/idle draw from active DC battery charge.
Missing/stale/charging members cannot establish that proof. App-start unavailability
only defers an already pending stop within its existing ten-minute bound.

Office charging is explicitly disabled pending the owner's confirmation of supply
capacity: execution `officeControlEnabled=false`, planner office
`chargingEnabled=false`, policy revision 6. The office plan reports blocked with
its reason; house planning/control remains independent. Repeated ticks reuse the
current house plan instead of needlessly fetching forecasts because office was
intentionally disabled. The 2.8 kW allowance has NOT been raised. The old 2.3 kW
office native assumption must be corrected before office charging is re-enabled.
The capacity question is pending; do not infer approval from elapsed time.

House-only execution config and its existing resident Flow are enabled again;
no new Flow was created. Fresh plan at 01:45 proposes 03:30–04:00,
04:30–05:00, 10:00–11:30 and 12:30–13:00 charging, about GBP 2.18 estimated
charging cost, aiming for 95% before peak. These are plans, not delivered energy.
The earlier bounded house test proved actual charge power and SOC 0% to 1%; the
next automatic house slot and full daily peak discharge remain unobserved here.
House minimum 0%, office minimum 3%, office readiness 10%, provisional office
100 W depletion/150 W demand inputs, no-house-discharge safeguard and native
watchdog remain. Owner-confirmed house output 2500 W is retained; no native
output, CT1 anti-export or feed-in setting was written by this repair.

Validation: HomeyPro 437 tests; isolated installed STREAM source 1371 tests;
shared STREAM tree including preserved unrelated diagnostics 1373 tests. Security
and whitespace checks pass. Preservation readback at 01:46 found no differences
outside the explicitly reviewed scope across 14 EcoFlow device definitions,
10 monotonic counters, Insights identities and unrelated Flows. Private evidence,
frozen backup and Master watcher cursor stay ignored and preserved. Codex
watcher/archive/backup tasks stay paused. No commit, push or Store publication.
General release and physical energy-delivery acceptance gates remain open.

## 2 November 2026 — current deployed reliability build / owner-confirmed output

This is the current checkpoint; preceding repair iterations below are historical.
Owner confirmed the native house output change to 2500 W was intentional. That
setting was retained, and planner-only house discharge power updated from 0.8 to
2.5 kW (policy revision 5). No native grid/output-limit command was sent. House
readiness remains 95% / minimum 0%, office readiness 10% / minimum 3%, with the
0.1 kW provisional battery depletion allowance and 150 W office AC demand baseline.

Installed local non-clean Development 1.11.20 archive SHA256:
`99a15eb82762d0883ed9b774b6aefb72804fb7d8c8acf4ff1249e709b5a5e1de`.
Resident runner SHA256:
`440b9980febd738805437ba1b1726f4a155830908a86f08e5e2082ef10e65275`.
Source remains uncommitted; no Store/Test/Live publication or Mainline merge.
Unrelated shared diagnostic edits were excluded from the isolated installed app.

Repairs cover verified native-watchdog restoration handoff; bounded delayed stop
progress while preserving house hold; no new starts during stopping; and a
no-write native busy response that cannot become a blind command replay or
permanent transport fault. A physical stop timeout still faults after ten minutes;
manual changes, unknown telemetry and unrelated faults remain authoritative.

Stop evidence now explicitly scopes the six existing office physical units using
IDs from the already reviewed office membership; the house/modern aggregate is
excluded. This is an intentional read-only member binding on the scoped gate.
All member power receipts must be applied, available and <=90 s old; each must
show <=5 W charging and fleet net power <=0. Combined with three independent
aggregate receipts spanning >=6 s, aggregate/grid/load receipts <=5 s old,
self-powered mode, reserve 3%, SOC >=3%, and <=50 W battery-branch/grid-load
residual, converter/maintenance draw can be distinguished from active bulk charge
at high SOC too. Stale/missing/charging members do not establish this evidence.
Existing direct noncharging/PV balance evidence remains. No historical power is
relabelled fresh or injected into Energy/counters. The normal house power guard
remains <=30 s and requires nonnegative flow while office charging is requested.

Validation: 433 HomeyPro tests, 1371 tests against matching isolated deployed-app
source, and 1373 shared-checkout app tests pass; lint, release boundary checks,
pinned Homey CLI verified validation, security and whitespace checks pass. This
includes high-SOC idle-loss regression, invalid/stale/missing/charging member
rejection, pending/busy no-replay, bounded timeout, exact watchdog-proof handoff,
and the owner-confirmed 2.5 kW planner input removing the old 800 W bottleneck.

Attended physical evidence from this repair: house ~2.5 kW, SOC 0% to 1%,
+0.023 kWh observed, stop/restoration verified; office ~2.45–2.72 kW and at least
+0.020 kWh observed while house power stayed 0 W, then delayed bulk stop verified.
A natural native lease expiry at 00:42:14 was recognised by the runner without
latching a false ownership fault. The final scoped-member build resumed at 01:06,
with normal automatic cycles subsequently verified. A foreground read-only soak
is observing the 01:30–02:00 office charging window and its stop; it is not a
new scheduled Codex task. Full-night and whole-bill savings remain unproven.

Preservation readback: all 14 EcoFlow device identities/definitions/settings,
Insights identities, 10 sampled monotonic counters and other Flows retained.
The only scoped-gate addition is the six office read-only member IDs. The output
limit discrepancy is resolved by the owner's confirmation; remaining native
mode/tasks/input/SOC/socket boundaries matched. CT1 settings were not commanded.
Frozen baseline and Master cursor hashes still match their preserved originals.
Private evidence remains ignored. Codex monitoring tasks were not resumed.

## 2 November 2026 — charging handoff/slow-stop repair installed and commissioned

Owner authorised continued repair, local deployment and attended proof. Previous
healthy-cycle checks were insufficient: a successful native watchdog restoration
was mistaken for a manual ownership change, and a 15-second physical office-stop
window did not cover the measured multi-minute ramp-down.

Runner now accepts only a recent matching completed native lease with exact
configured device identities, expected/restored reserves and fresh device fields.
It records the event, never clears a pre-existing fault automatically, and still
rejects manual/old/faulted mismatches. The app/runner support an explicit stopping
phase: preserve house hold, reject new starts, wait for physical office stop,
then restore house. A native busy response guarantees no command was attempted;
the runner preserves prior ownership and waits without latching or replaying an
uncertain command. Ten minutes is the bounded maximum before a genuine fault;
this does not renew a charging lease. Unknown/stale power remains unknown.
Native BMS maintenance is explicitly distinguished from bulk charge: at reserve
3% and reported SOC <=4%, three independent fresh samples must show battery draw
<=50 W and grid-minus-local-load <=50 W in self-powered mode without a reported
alarm. This permits a small maintenance draw; it does not mean zero AC charging.

Non-clean local Development 1.11.20 patch, archive SHA256
`b68d9f6248988b7ce2e92298125e7f62057949a54b9a06f7875c7f55ee9aaa43`.
Runner SHA256
`440b9980febd738805437ba1b1726f4a155830908a86f08e5e2082ef10e65275`.
No Store/Test/Live publication or Mainline merge. Built in an isolated copy of
ce2aaf9 plus this app/test repair, excluding unrelated local diagnostic edits.
Validation: 432 HomeyPro tests, 1369 isolated deployed-app tests, 1371 shared-app
checkout tests, lint/release-boundary/pinned CLI verified checks, security and
whitespace checks passed. General monitoring/energy release gates remain open.

Attended house charge: SOC 0% to 1%, approximately 2.5 kW and +0.023 kWh observed;
scoped stop/native restoration verified. Further house holding tests reached 2%.
Office charge: approximately 2.45–2.72 kW, +0.020 kWh counter increment observed,
with house battery power 0 W throughout office charging. Office reserve restoration
3% acknowledged before physical ramp-down finished; the old stop check faulted,
and that evidence was preserved/reviewed. Physical stop was subsequently verified,
house restored to 0%, and histories retained. Source/state replay was not used as
physical proof. Both charge and restoration paths were exercised.

Live native-watchdog handoff test: paused only the execution Flow, left the owned
lease to expire naturally at 00:42:05 GMT, and verified completion at 00:42:14.
After resuming, the runner at 00:42:19 recognised the exact completion receipt,
recorded watchdog history, dispatched normally and did not latch an ownership
fault. The following natural 00:43 run verified healthy. Routine execution is
active again. House 95%/0% and office 10%/3% policy remain; Codex monitoring tasks
were not resumed. No claim of a full-night soak or whole-bill savings is made.

Preservation comparison retained 14 EcoFlow device identities/definitions/settings,
all Insights identities, 10 sampled monotonic counters, other Flows and native scope
gate. One native telemetry discrepancy remains under investigation: reported house
maxGridOutputW changed from 800 to 2500 W during tests, while the separate output
ceiling was already 2500 W. No grid-limit command was sent: source envelope writes
only reserve field 30. Owner was asked about a native-app change. Do not reset it
or claim that native limit unchanged; retain planner discharge assumption 0.8 kW.
Other observed native mode/tasks/input/SOC/socket boundaries matched. Raw before,
commissioning, stop, native-expiry and post-deploy evidence remain ignored/private.


Final no-write busy handling deployed at 00:50–00:52 GMT with the archive/source
hashes above; first final-build run verified at 00:52:04. All targets/reserves,
manual-change guards and native stop requirements retained. Current published-price
plan: office 01:30–02:00, 09:30–10:00, 11:00–11:30, 13:00–13:30 (2.8 kWh,
£0.947); house 03:30–04:00, 04:30–05:00, 10:00–11:00 (5.0 kWh, £1.673).
Projected pre-16:00 SOC remains office 10%, house 95%, no readiness shortfall.
These are forecasts. The native-expiry proof above preceded the final busy-only
addition; final-build readback/automatic cycles are separate evidence.

## Stefan updated; Ed confirms Live runtime — 1 November 2026

Public post 87: Stefan installed the new version and will report back; sustained
stability is not yet confirmed. Public post 88: Ed confirms installed 1.10.3 on
Homey Pro 2023 and no intervening changes, resolving the diagnostic-version
mismatch. Owner requested instructions; posted as JZ and reopened public post 89:
https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/89 .
Instructions: update same app/Homey in place from Test; confirm installed 1.11.20;
retain legacy devices/history/Flows; use dedicated STREAM 5000 Series Unit with
EcoFlow app-account pairing (do not duplicate an existing dedicated unit); leave
battery/MQTT/Energy settings and aggregate Energy pairing unchanged. Old history
and Flow identities do not transfer automatically to a new monitor. Request one
private integration support report only if dedicated monitoring remains blank.
Field telemetry pass remains pending. No app/source publication or local hardware
change made for these community instructions.

## Existing coordinator resumed and first scheduled run verified — 1 November 2026

Owner explicitly approved re-enabling existing coordinator after the fresh replan
review. Rechecked the deployed runner SHA256, paused Flow/config, no active
fault/intent/run lock, completed lease, matching House 0 / Office 3 ownership,
fresh native fields, self-powered/empty House tasks and manual-hold state.
Preserved private baseline and enabled only existing execution config and Flow;
readback confirms policy/app settings unchanged. No manual Flow/runner execution,
code deployment or replay of the expired pre-16:00 plan. Test/Live unchanged.

First natural scheduled run: plan evaluated 16:02:03 UTC, run 16:02:04,
verified 16:02:07. At 16:02:19, status hold for higher-value periods, expected and
actual House reserve 0 / Office 6, available batteries, House idle and Office
discharging. No fault, outstanding intent or active run lock. Native routine
lease is active as expected; execution is NO LONGER paused. This is a fresh
routine preservation hold, not the old 7% intent. Office 10% readiness/depletion
proposal remains undeployed. One-run readback is not a long soak or proof that
watchdog unavailability cannot recur. Private receipts retained outside Git.

## Fresh coordinator replan and Stefan update — 1 November 2026

Read-only replan at 15:57 UTC used current installed policy and fresh app field
receipts. No live Logic/device writes or script execution/deployment. Expected
ownership House 0 / Office 3; no intent/fault; both execution switches still off.
Office planned without charge slots; House reports readiness shortfall. The tiny
pre-16:00 House opportunity cannot restore today's 95% target and must not be
replayed. Resumption must calculate a new plan at its actual execution time.
Live runner hash 7641cfcd446302109ad2222080df81f3b0c82171618ca3f4421068c1b2d406a4
matches the HomeyPro recorded deployed runner; local Office-readiness proposal is
not deployed. Proposed resumption is in outputs/coordinator-resumption-review-2026-11-01.txt
outside Git. Existing 2.8 kW site allowance and native-rate/ownership/lease guards
remain; no policy change proposed. Prior maintenance step 8 requires separate
fresh replan/resumption review; execution remains paused pending approval.

Owner authorised Stefan update; posted as JZ and reopened permanent public post:
https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/86 .
Requests normal-use feedback on Test 1.11.20, preserves devices/capacity/settings,
and asks time/affected devices/native readings/self-recovery if freezing recurs.
No new broad raw capture or re-pair request. No installation/publication here.

## Test 1.11.20 / build 87 verified — 1 November 2026

Owner authorised Test publication of the locally validated recovery-only archive.
Build 87 activated and read back as Test 1.11.20; EN/DE/NL listing/changelog match.
Source fb053dbf401d7d36d59f9423cd4714c39f1bfe24; exact CI
https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41322550578 passed.
Archive SHA256 5304493340c456e352b4f72f3776f304676bf582e4059839d68f6cd764bdc439.
Post-publication readback at 15:53 UTC confirms installed Development 1.11.20,
same devkit session, all device IDs/definitions, settings, Flows and Insights
unchanged. Live remains 1.10.3/build 18. Coordinator remains paused under the
approved maintenance procedure; no resumption or battery operation for publication.
Separate consumer-queue diagnostics remain uncommitted/source-only, excluded from
this archive. Do not confuse their 1,368-test local result with recovery archive
validation (1,366 tests plus exact CI). No field resolution of Stefan/Ed/Robert
is claimed. Next: review fresh coordinator replan/resumption; obtain Stefan's
normal-use result on this recovery build, Ed's version/driver confirmation and
Robert's bounded comparison. Review diagnostics before another candidate.

## Development 1.11.20 installed; coordinator left paused — 1 November 2026

Owner approved outputs/ecoflow-1.11.20-maintenance-review.txt. Fresh baseline
confirmed the recorded ownership (House 0 / Office 7), self-powered mode and
empty House tasks. Paused the owned execution Flow and configuration, checked
no active run/command, then used the existing office-only stop path once. It
verified Office reserve 3% and grid-charge stop; House reserve remained 0%.
Preserved the old lease/fault and intent in private snapshots and maintenance
history. Reconciled to House 0 / Office 3, emptied the obsolete intent and set
old plan null without replay. Both execution switches remain disabled.

Exact recovery-only archive SHA256
5304493340c456e352b4f72f3776f304676bf582e4059839d68f6cd764bdc439 installed once,
non-clean Development/debug false. Source fb053dbf401d7d36d59f9423cd4714c39f1bfe24,
exact CI 41322550578 passed. Archive-provenance runtime fingerprint:
70bdb73e630ead99f24349d902acb80f64231fd8964e7863124c098412c7a1eb.
This is not an independent installed-filesystem rehash.

Initial readback at 15:49 UTC: Development 1.11.20 running/devkit_install;
14 EcoFlow definitions, all device identities, 101 Flows and Insights identities
preserved. No app-setting drift from reconciled installation baseline. Ten
reported cumulative capability counters known and nondecreasing within exposed
precision. Original aggregate verified its main and receives natural MQTT/REST
readings; batteries and CT1 available. House 0 / Office 3, fresh readings,
completed nonfaulted lease, no intent and invalidated plan confirmed. Mobile UI,
forced recovery and 48-hour soak not claimed. No forced disconnect or pairing.
Test 1.11.19/build 86 and Live 1.10.3/build 18 remain unchanged. Separate uncommitted
consumer-queue diagnostics remain source-only and are not installed.

Second readback at 15:50:58 UTC passed the same preservation, fresh-reading,
counter and paused-ownership checks. This is short continuity only, not a soak.

Next: review local candidate before Test, and separately review a fresh
coordinator replan/resumption. Never resume the
old intent or elevated reserve automatically. Other tasks may read this status;
no cross-task mutation authority is implied.

## 1.11.20 recovery release held; queue diagnostics prepared — 1 November 2026

Recovery fix committed/pushed as fb053dbf401d7d36d59f9423cd4714c39f1bfe24.
Clean exact-source 1.11.20 archive validated with pinned CLI 4.5.3; manifest is
outputs/ecoflow-recovery-1.11.20-build.json outside Git. Archive SHA256
5304493340c456e352b4f72f3776f304676bf582e4059839d68f6cd764bdc439.
Installation and then Test publication held: fresh private coordinator preflight
found faulted/incomplete expired lease, an outstanding intent, Office reserve
held above restoration and discharge in progress. No app restart, runner pause,
lease/intent/fault edit or battery operation performed. Owner authorised a note
asking the Homey automation task to investigate read-only and propose safe
reconciliation for review; note delivered. No installation can proceed from a
forecast alone. Test remains 1.11.19/build 86; Live and installed unchanged.

Separate uncommitted engineering work instruments the existing original-driver
consumer queue: bounded per-source queued/started/completed/failed/skipped counts,
pending/running counts and relative receipt ages. Fixed metadata only; no raw
payloads, identities, exception text, new subscribers or device requests. Export
is allowlisted through reportingSnapshot; completion is not acceptance or valid
telemetry. This distinguishes callback receipt awaiting processing from absence
of consumer delivery; it does not distinguish broker silence from upstream
routing loss. Queue draining/shutdown behavior remains unchanged. Diagnostics
are NOT included in the already-built archive or its CI evidence.

Exact recovery CI passed: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41322550578 .
Separate queue-diagnostic work passes all 1,368 tests, lint, release:check, diff
check and pinned verified validation locally; no remote CI for that work yet.

## Original STREAM overlap recovery candidate — 1 November 2026

Reproduced duplicate main verification across overlapping polls; base quota
coalescing did not protect the aggregate prerequisite. Coalesce the entire poll
per lifecycle and fence entry to the base poll. Regression verifies transient
failure, retry recovery, availability and counters. Not proven as Stefan's cause.
See [audit and diagnostic limitations](ORIGINAL_STREAM_FREEZE_INVESTIGATION.md).
Source-only changes; no commit/push, Test/Live change, installation or message.
Sprint 1 preservation regression and unrelated local AI edits retained.
Ed's reviewed reply was posted and reopened at public post 85:
https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/85 .
Field confirmation of Ed's installed version/device type remains pending.

Validation for this candidate: Node 22 committed-lockfile npm ci, all 1,366 tests,
lint, release:check, git diff --check and pinned Homey CLI 4.5.3 verified validation
passed. No new remote CI or physical acceptance claimed.

## Sprint 1: ES22 legacy-runtime mismatch — 1 November 2026

Reviewed the new AC 5000 blank-telemetry report against its diagnostic email:
user states 1.11.19; diagnostic identifies 1.10.3/build 18 and original STREAM
pairings. Current source already excludes/quarantines those pairings. No new
1.11.19 telemetry defect confirmed. Added preservation regression for both real
legacy drivers; field confirmation remains pending. See
[review and unsent reply](STREAM_5000_LEGACY_PAIRING_REVIEW.md).
Correction to the earlier publication checkpoint: Robert's approved 1.11.19
instructions WERE posted and reopened in Chrome; permanent private post is
https://community.homey.app/t/dual-ct-error-2/161570/30 . No new response was present
at the 1 November review. Test/Live/installed unchanged by this sprint.

Validation: Node 22 committed-lockfile npm ci, all 1,365 tests, lint, release:check,
git diff --check and pinned Homey CLI 4.5.3 verified validation passed.
Runtime fingerprint remains unchanged; no new field acceptance is claimed.

## Test 1.11.19 / build 86 verified — 31 October 2026

Diagnostic source `4aeb5c91187bc5c1654562d9caa108dbc2ce3351` pushed; exact CI
https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41243570750 passed.
All 1,364 tests, locked Node 22 install, lint, release:check, diff check and pinned
Homey CLI 4.5.3 verified validation passed. Clean committed-source archive SHA256
`f05f1f520bfafd53dab5c23adaac7c0ffeb6ebe8a381d026d65447095facd816`; runtime
fingerprint `14cbea1797cd3591d7345e11b95b3c160ffd35717d18beb41e871053380fe866`.
Build 86 metadata matched EN/DE/NL; Test activation confirmed through developer API.
Live remains 1.10.3/build 18. Installed Development 1.11.16 remains running with
the same devkit session. All device identities, EcoFlow device definitions, 101
Flows and 1,204 Insights identities preserved; single-phase CT1 available.
Concurrent unrelated device metadata and houseReserveLease hash changed during
readback; no full-house settings equality is claimed. This release issued no
installation, battery command, settings write or Flow execution. Hardware gates
remain open. Robert's version-specific message is prepared locally but NOT SENT:
browser access returned unavailable. Resume posting the approved draft and verify
its permanent item when browser access is restored; no new release needed.

## 1.11.19 diagnostic Test release preparation — 31 October 2026

Owner approved committing/pushing the targeted comparison, publishing to Test and
sending Robert the reviewed steps. Version 1.11.19 contains the bounded incoming
metadata and three-stage comparison, plus the sparse-feed replay tests. Existing
message admission, counters, source binding and freshness rules remain unchanged.
Local Node 22 locked install, all 1,364 tests, lint and release:check pass.
CI, archive and Test activation remain to be verified. Live and installed app
are outside this release scope. Local AI workflow edits remain unstaged.

## Targeted Dual CT comparison candidate — 31 October 2026

Added bounded incoming message metadata to detailed-monitor and community-trial
support evidence: command IDs including rejected 39, fixed topic class, CT1 field
presence, outcome, receipt gaps and counts. No values, IDs, payloads or new network
operations. 32 groups / 15 minutes; decoder admission and Energy rules unchanged.
Added EN/DE/NL three-stage local-GET comparison workflow producing one copyable
report. User-labelled phases do not prove native actions; outgoing commands remain
unobserved. See [tester draft and interpretation](DUAL_CT_TARGETED_COMPARISON.md).

Source remains local and unversioned relative to Test 1.11.18. No push/publication,
installation or tester message. Preserve earlier sparse-feed tests and local AI
workflow edits. New Test release and instructions require the next reviewed step.

Local validation: committed-lockfile npm ci, all 1,364 tests, lint, release:check,
git diff --check and pinned Homey CLI 4.5.3 verified validation passed. Hardware
acceptance gates remain pending; no new remote CI or field result is claimed.


## Dual CT native bridge trace and validation proposal — 31 October 2026

Static trace now reaches EFSmartDeviceModule.sendMsg. Product-specific request is
ConfigWrite 254/17, dst 2, ddst 1, V3, field 71 true only, needAck false, 6000 ms.
Device-scoped session supplies same selected src/dest serial and actionId 0. Actual
wire framing/topic/transport and firmware persistence remain inside native code or
hardware; no MQTT encoder or command is qualified by this trace.

Correction: Dual CT UI handles custom legacy 21 AND shared display 39. No field
command-ID evidence yet shows that 39 caused a rejection; acceptance unchanged.
Prepared [review protocol and vendor draft](DUAL_CT_TELEMETRY_REQUEST_REVIEW.md).
Opening the native meter screen may send an upload command, so the proposed
observation is approval-gated and not represented as purely read-only hardware work.
No runtime/source behaviour change, hardware operation, install, publication or
external message. Prior 1,358-test result remains applicable; this step changes docs
only. Test/Live/installed state not freshly queried and unchanged by this work.


## Sparse-feed replay and native telemetry lead — 31 October 2026

Read-only research and offline tests following the latest 1.11.18 field summary.
Two new regressions reproduce busy shared traffic versus sparse target delivery,
recent detail versus expired Energy, checkpoint preservation and gap-safe recovery.
All 1,358 tests, Node 22 locked install, lint and release:check pass. No new delivery
bug confirmed; runtime and fingerprint unchanged. See
[the investigation](DUAL_CT_SPARSE_FEED_INVESTIGATION.md) for evidence and next steps.

Static native Dual CT code has a concrete on-demand upload lead: its online hook
sends activeDisplayPropertyFullUpload through ConfigWrite (254/17, dst 2, field 71).
This is NOT a qualified read-only GET. Outer envelope, persistent effects and
snapshot-versus-stream behaviour must be resolved before proposing execution.
No encoder/publish path or broadened message acceptance was added. Official 5000
API and upstream HA research do not establish a Dual CT live-reporting contract.
No hardware request, settings change, installation, publication or message sent.
Sprint 1 complete; Sprint 2 qualification remains open. Test 1.11.18/build 85,
Live and installed Development remain as previously recorded, not freshly queried.


## Test 1.11.18 / build 85 verified — 31 October 2026

Source `5c453f709a14725e73a87560038de086554fe884` committed/pushed; exact CI
https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41239562446 passed.
Locked Node 22 install, all 1,356 tests, lint, release:check, diff check and pinned
CLI 4.5.3 verified validation passed. Clean-source archive SHA256
`c269c67e9775973afd64557ac73116b779d58944a71b6cf0e6c060c451cfb30c`; runtime fingerprint
`b7ae978883245330dd89d1562c053b3be829f68f8450af7f4a2ce2638ab8baca`. EN/DE/NL metadata matched; build 85 activated
and read back as Test. Live remains 1.10.3/build 18. Installed Development 1.11.16
and devkit session unchanged; EcoFlow definitions/settings, all device IDs, Flows
and Insights IDs matched. CT1 remained available. Whole-house metadata changed and
the running coordinator's houseReserveLease changed; no settings/lease write ran here.

Focused tester reply sent, signed JZ, and permanent item reopened/verified. Requested
one existing small support summary after about ten minutes or after recurrence,
without re-pairing, Repair, settings/Energy changes or separate raw capture. Explicitly
explained shared socket vs target device counts and that this is a diagnostic correction,
not a proven delivery fix. Next sprint depends on field summary; no hardware changes.


## 1.11.18 Test candidate — 31 October 2026

Owner approved release of the prepared socket/routing diagnostic correction to Test
and focused tester instructions. Live and installed Development remain unchanged.
No telemetry requests, stream activation, new subscriptions or accounting changes.


## Dual CT 1.11.17 zero-delivery investigation — 31 October 2026

Reviewed and locally decoded the newest private tester support summary. Both roles
show connected/listening, two active topics, zero pending/rejected/timed-out topics,
zero routed frames, zero decoder rejections, no retry scheduled. Detailed monitor
waited about 382 seconds. Whole-property Energy remains unconfirmed/inactive per
tester correction; a paired community-trial role is not proof of Energy selection.

Confirmed diagnostic defect: receivedFrames is incremented only after topic/serial
routing, so zero cannot distinguish socket silence from discarded routing traffic.
Added bounded current-connection socket message, route-rejection and PINGRESP counts,
relative ages and explicit shared_current_connection scope. These are shared socket
observations, not Dual CT-specific receipts; other devices may contribute. Existing
per-device delivery counters remain separate. Old socket callbacks cannot update
new evidence, and replacement connections reset socket counts. No new subscription,
publish, reconnect, timer, control, decoder permission or accounting change is added.
Red regression reproduced the missing evidence; all 1,356 tests, locked Node 22
install, lint, release:check, diff check and pinned CLI verified validation pass.
Changes remain local for candidate review, without version bump or publication.
Test 1.11.17/build 84, Live and installed Development were not changed by this task.

Delivery failure remains unexplained. Upstream HA cloud_mqtt.py uses the same two
app topic families, plus an open quota topic; non-listen-only paths send explicit
get-all/latestQuotas and optional stream activation. Its comments about stale feeds
include other products, not validation for this Dual CT/firmware. Do not copy its
SET/stream switch or treat reply payloads as fresh Energy intervals. Reference:
https://github.com/shuette42/ecoflow-energy-ha/blob/main/custom_components/ecoflow_energy/ecoflow/cloud_mqtt.py

Bounded sprints:
1. Evidence/routing audit COMPLETE: decoded report; reproduced diagnostic ambiguity;
   regression-tested socket-vs-route-vs-consumer separation and privacy.
2. Field delivery qualification PREPARED: review/release the diagnostic correction;
   collect one current summary under ordinary use. Shared socket zero + recent
   PINGRESP means broker responsive but no PUBLISH reached this socket. Socket
   messages with route rejects require route investigation; socket messages without
   rejects but no target frames mean traffic belongs elsewhere, not target recovery.
   Do not re-pair, reset counters or assume native EcoFlow readings prove MQTT delivery.
3. Demand-driven telemetry/recovery PENDING: if genuine target silence is established,
   first qualify a product-specific read request and its response envelope using
   authoritative/vendor evidence or existing authorised captures. Prepare exact
   one-shot request, no SET/stream activation, cooldown/deadline and echo/reply fences
   for review before hardware execution. A cache reply cannot become live accounting
   evidence. Stable normal-use/48-hour acceptance follows a confirmed correction,
   not merely green tests or an acknowledged subscription.

No extra tester request or external message was sent. Preserve private report locally;
do not upload the original report or household evidence into Git.


## Test 1.11.17 / build 84 verified — 31 October 2026

Source `085969ad0a11a1cd57e63144655e2b4a6c08daa9` committed and pushed on diagnostic branch.
Exact CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41230122689
passed. Clean source packaged with pinned CLI; archive SHA256
`465ba8fe006fb687d9c1d4f0320f70346d9a38843d1149f8eba6422afaed6c11`; runtime fingerprint
`b17bdae75c722665941b963b0f212487e1cc9cfbe3e2b783ea4c882e1f5436ee`. EN/DE/NL metadata matched; build 84 activated
and read back as Test. Live remains 1.10.3/build 18. Installed Development 1.11.16
charging-reliability archive and devkit session were unchanged. All EcoFlow device
definitions/settings, app settings, device IDs, Flows and Insights identities matched
the private baseline. CT1 remained available; unrelated whole-house device metadata
changed during observation, so no claim of whole-house metadata equality is made.

Focused tester instructions sent, signed JZ, and reopened at permanent item for
verification. Acknowledged that whole-property Energy is not configured on the
tester installation. Requested one small Dual CT support summary after recurrence
(or after ten minutes without recovery), without re-pair, Repair, settings change,
forced reconnect or raw capture. Await that evidence; root cause and stable physical
recovery remain unconfirmed. No installation or hardware change ran in this task.


## Dual CT targeted diagnostics / 1.11.17 candidate — 31 October 2026

Owner authorised a targeted app diagnostic, Test release and tester instructions;
Live and installed Development remain unchanged. Preserves newer committed charging
reliability changes (e512d61); these are included in this candidate, not reverted.
Current installed Development is the separate 1.11.16 charging-reliability archive.

Latest private tester evidence: 1.11.16 received three rejected frames classified
scope_or_receipt_rejected, later briefly displayed detailed CT1 readings, then became
unavailable again. Tester explicitly says whole-property Energy selection is not
active. This proves intermittent accepted readings, not a broken saved pairing or
stable Energy operation. No re-pairing is justified by this evidence.

Split the broad monitor rejection into topic category, buffer/size, clock/receipt
validity, future receipt and expiry classifications. The checks and acceptance
boundaries are unchanged. Reply-topic traffic is labelled separately and remains
ineligible for live readings. Added up to 32 coalesced recent classified events
with relative ages, plus retry scheduling state. Preview availability transitions
and three-phase startup/delivery/recovery events are included. Events are local,
volatile, bounded and contain no topic strings, IDs, errors, packets or readings.
Repeated adjacent reasons coalesce; the age is of their latest occurrence. Event
history survives local recovery but resets when the device/app instance restarts.

App settings now offer Show Dual CT support summary (EN/DE/NL). It uses the existing
read-only local support endpoint and extracts only app/Homey versions and sanitised
Dual CT sections. Existing Copy integration support report copies this small result;
no discovery, forced reconnect, settings change or automatic upload is performed.

Regression coverage separates rejection gates, acceptance then natural expiry,
bounded/coalesced history, clock reversal, event sanitisation and summary copy/privacy.
Node 22 locked install, all 1,354 tests, lint, release:check, diff check and
pinned CLI 4.5.3 verified validation pass.
Counter/accounting and freshness policy are unchanged. Hardware root cause is still
unconfirmed; this release supplies discriminating evidence rather than claiming a fix.


## 31 October 2026 — charging reliability source review

Owner authorised review, commit and push of the charging reliability changes.
Review covers independent configuration freshness, fail-closed restoration and
manual ownership, bounded failure history/notifications, and regression coverage.
HomeyPro also includes the previously deployed 95% pre-peak readiness policy and
its tests. No further installation, Homey control, settings/Flow change or Codex
monitoring-task resumption is authorised by this source-publication step.
Private evidence and unrelated local-AI workflow edits remain outside the commits.
Earlier uncommitted-source statements below describe their dated checkpoints.

## 31 October 2026 — owner house charging reliability repair installed locally

Owner authorised missed-house-charge diagnosis, repair and bounded physical proof.
Preserved private evidence identifies the 02:33 coordinator ownership latch after
an office-first watchdog restoration, with stale house configuration. That latch
blocked both roles until separate owner-reviewed reconciliation at 16:20. The
initial missing configuration field/transport cause is not established.

Fixed watchdog refresh selection: old reserve/mode/task configuration now triggers
a bounded read even with fresh power; refresh begins at 600 seconds while the
1200-second validity horizon remains. Expiry can reread stale configuration only
after office stop, and cannot adopt a manually changed reserve. New regressions
cover recovery with fresh power, unrecoverable stale configuration, office-first
stop and manual ownership. All 1351 tests, lint, release checks, diff check and
pinned CLI verified validation pass.

Installed a non-clean local Development 1.11.16 patch, same version but distinct
uncommitted archive SHA256
`dec5aa02c3c63fa7eca31f0b5c5eece5e5c98d8674e2e4401822db76239ac384`.
No Store channel/publication, identity, pairing, device-definition or Energy change.
The coordinated runner was paused safely with house 0%, office 3% and completed
lease, then restored. A one-off 1% house reserve test with native 180-second lease
showed approximately 2.5 kW actual charging, +0.030 kWh charged and SOC 0% to 1%.
Scoped stop/native expiry restored house reserve 0%, office 3%, completed/no-fault
lease; subsequent house discharge approximately 795 W observed. This is bounded
charge-path evidence for this archive, not full monitoring/release acceptance or
a future tariff schedule/bill-saving result. General acceptance ledgers unchanged.

Private preservation readback retained all device IDs, 14 EcoFlow definitions,
Flows, Insights identities, 10 sampled cumulative counters, house/CT1 limits/mode/
settings and office owner-controlled feed-in. Current property meter is the Dual CT
Energy device (Single phase / CT1); older smart meter is office only. All six office
unit powers are now reported; synchronized fleet energy balance remains unqualified.
HomeyPro source retains forecast demand baselines and new bounded failure history.
No source commit/push or Codex monitoring-task resumption in this change.

## Test 1.11.16 / build 83 published — 31 October 2026

Source `a177dfa44a6871503d8a637e70ff0545c388a386` pushed to diagnostic branch.
Exact CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41221140493
passed; locked Node 22 install, 1,348 tests, lint, release:check, diff check and
Homey CLI 4.5.3 verified validation passed. Clean committed-source archive SHA256
`5e45fca3dd246f8236c941d6174c5d8ed6eb7b9538a592c37d0e854bb24fdf17`;
runtime fingerprint `71209ae5f6de8ecde1e75446827390a8da7dad21fccbd0e38dc4a1a17b640ca6`.
Build 83 processed with matching EN/DE/NL listing/changelog, activated and read back
as Test. Live remains 1.10.3/build 18. Installed Development 1.11.14, devkit session,
all EcoFlow device definitions/settings, all device IDs, Flows and Insights IDs
were preserved. Single-phase CT1 remained available. Whole-house metadata comparison
was not identical: two non-EcoFlow devices changed, and the running coordinator's
houseReserveLease changed. No installation, hardware commands or settings edits ran.

Tester update sent and permanent item reopened/verified, signed JZ. Requested ordinary
observation after update, keeping existing devices/settings/counters, and only the
current bounded Dual CT report sections if unavailable. No re-pairing or raw capture.
The exhausted shared-topic retry defect is reproduced and fixed; it is not proven
to explain the tester's current outage. Full-release hardware gates remain open.


## Dual CT reliability review / 1.11.16 candidate — 31 October 2026

Owner authorises focused review followed by commit/push, CI, Test publication and
a tester update. Includes the previously reproduced exhausted shared-topic retry
fix. New churn regression proves repeated attach/detach does not multiply a
scheduled retry or resubscribe the healthy topic. Reviewed sparse/mixed/partial
packets, delayed/duplicate/retained frames, source qualification, startup recovery,
shutdown and checkpoint preservation against existing driver/protocol regressions.
No additional accounting defect was confirmed; freshness and source gates remain.

Added allowlisted startup failure counts to three-phase support feedback: source,
contract, binding, admission (including checkpoint/overlap), subscription and later
identity refresh. Stale asynchronous generations cannot record current failures.
No raw exception text, account, serial, power or counter values are added. New
real-driver regressions cover source/contract/binding/subscription failures,
single retry scheduling, cleanup and unchanged counters/store. These counts are
historical since app startup, not a claim that the latest failure remains active.
Current tester Dual CT outage is still unproven; no re-pairing is requested.

Candidate validation: Node 22 npm ci, 1,348 tests, lint, release:check, diff check
and pinned Homey CLI 4.5.3 verified validation pass. Hardware acceptance gates
remain open; this is a Test candidate, not full-release hardware signoff.

## Dual CT three-path investigation — 31 October 2026

Reviewed existing private 1.11.12 support extract, 1.11.13 failure report and the
previously read 1.11.14/1.11.15 community updates. The latest updates show both
Dual CT roles unavailable while other devices recovered, but contain no current
subscription counters or binding diagnostic. No new capture was requested.

1. Subscription: 1.11.12 reported two accepted topics, zero denied/timed-out topics,
   three frames and approximately 250 seconds since the last frame. This proves
   earlier delivery, not current broker health. Found a separate reproducible
   exhausted-retry defect: an existing listener kept a failed topic attached, and
   a newly attached recovering consumer never restarted its exhausted retry.
   Local fix retries only rejected/timed-out topics with no scheduled timer when
   a new handler joins. Active/pending topics and existing retry timers are kept;
   each new attempt retains the three-attempt bound. No forced socket reconnect,
   meter status request, fabricated frame or accounting write is added.
2. Rejections: earlier evidence records one admitted CT1 anchor plus an unrelated
   message and delivery gap; two preview packets were accepted. Existing synthetic
   sparse-feed replay continues to match the classifications and zero coverage.
   This is consistent with missing subsequent delivery; it does not identify why
   delivery stopped. No decoder/freshness relaxation is justified by the evidence.
3. Bindings: an admitted anchor required the saved account/source/grid binding to
   pass at that earlier time. Latest messages do not establish a binding mismatch.
   Existing three-phase binding/checkpoint and single-phase preservation tests pass.
   Re-pairing would replace identity/counter continuity and is not justified yet.

New regression failed before the fix (no retry on new consumer) and passes for
both denial and timeout exhaustion. It also verifies no healthy-topic resubscribe,
no fabricated telemetry, duplicate-listener idempotence and both consumers receiving
later frames. Node 22 locked install, all 1,346 tests, lint, release:check, diff check
and Homey CLI 4.5.3 verified validation pass. This fix is not established as the
cause of the tester's current outage. Next evidence, if needed after review, is a
small current-version subscription/rejection/binding classification, not another
raw household report. No commit/push, publication, install or hardware changes.

## Test 1.11.15 / build 82 published — 31 October 2026

Cleanup source committed/pushed as `69c3356b049fba0330f9cc3d30fca59fbd64cf9b`.
Exact CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41219610862
passed. Clean-source archive SHA256 `4741bb499ef3f08750ce51e3b439e11fcf77860939158adc9f5637e214566659`;
packaged-source fingerprint `a4fdc5caac49b28eaeb9421d37dc8ddd81465a0e9331f7e4b2dabd7ab114d4ea`.
Build 82 processed, EN/DE/NL metadata matched, Test activated and read back.
Live remains 1.10.3/build 18. Installed Development 1.11.14 and devkit session
are unchanged. All EcoFlow device definitions/settings, all device IDs, Flow
contracts and Insights IDs match publication baseline. House reserve lease changed
while the resumed coordinator operated; app-wide settings equality is not claimed.
Other-app device metadata also differed; whole-house equality is not claimed.

Authorised tester update posted and reopened. It acknowledges broader recovery
on 1.11.14 while both Dual CT roles remain unavailable, explains this release's
setup/display scope, and does not request repeated captures, re-pairing or claim
the remaining feed failure is fixed. Private receipts/correspondence stay outside
Git. Next investigation: remaining shared Dual CT feed; hardware gates remain open.

## Test 1.11.15 preparation — 31 October 2026

Owner authorises diagnostic-branch commit/push, exact CI, Test publication and a
community tester update. Cleanup changes validated with locked Node 22 install,
1,345 passing tests, lint, release checks and Homey 4.5.3 verified validation.
New version 1.11.15 distinguishes the release from installed Development 1.11.14
cleanup. Publication must preserve Live and the installed Development session.
Fresh tester feedback confirms broader devices recovered on 1.11.14 but both
Dual CT roles remain unavailable. This presentation cleanup does not claim to fix
that remaining field problem. Private correspondence is retained outside Git.

## Owner Development cleanup installed — 31 October 2026

Owner approved fault reconciliation, temporary coordinator pause/resumption and
non-clean local installation. Fresh preflight found App Store 1.11.14 installed,
superseding the earlier Development 1.11.10 observation. The Office watchdog had
restored reserve from 13% to 3%; House configuration freshness then faulted and
the coordinator retained its earlier 13% expectation. With execution paused,
read-only refresh confirmed House reserve 0%, Self-powered, no tasks, and Office
reserve 3%. The owner-approved reconciliation preserved faults in maintenance
history, marked the restored lease complete and aligned the Office expectation.
No direct battery-setting command was issued.

The uncommitted cleanup candidate was installed non-clean as Development 1.11.14
(same version number as store Test, distinct archive). Archive SHA256:
`1af89d7435fe34376e672883ebb4f151cbfa7d8f63e80763a2b1b681b1c7638a`;
packaged-source fingerprint:
`e3df8b0ab90257604871fe02a9e7a426462d10fb895ef1253bd768c036e1440f`.
Homey delivery acknowledged and running devkit_install readback verified. This
fingerprint identifies the packaged source; no separate runtime hash API claim.
All 14 EcoFlow devices became available, including both Dual CT roles. Energy
settings show Single phase — CT1. Existing identities/names/zones/capabilities,
settings (apart from the new presentation label), Flows, Insights IDs, app settings
and nondecreasing cumulative counters passed offline baseline/readback comparison.
Store channels were unchanged. Original coordinator config and execution Flow
were restored after fresh readings and preservation checks. No Test/Live publication,
Mainline change or new hardware acceptance claim. Private receipts stay outside Git.

## Pre-Test setup and compatibility cleanup — 31 October 2026

Validation: Node 22 committed-lockfile install; all 1,345 tests, lint,
release:check, git diff --check and pinned Homey CLI 4.5.3 verified validation
pass. The label uses paired_mode_summary to avoid Homey reserved setting prefixes.

Local candidate updates the README and EN/DE/NL research guidance for one Dual CT
pairing entry and STREAM 5000 Home Battery naming. CT2 is optional circuit detail,
not a separate solar/load Energy contributor. Cloud response time is not promised
from native product marketing; CT1 totals remain observed-power estimates excluding
gaps. Research candidates are distinct from qualified CT1 accounting.

The Energy device now shows a read-only Paired Energy mode label in Advanced
Settings, sourced from saved pairing consent/mode. Display choices cannot change
that authority. Label failures do not block optional details. No source migration,
capability removal or counter rewrite is introduced. Existing user names remain.

Offline regression coverage compares both legacy-monitor and Energy capability,
repair and Energy contracts against the published 1.11.14 source baseline; the
fixture is public manifest data, independent of Git history availability in CI.
Driver tests cover single/three-phase labels, display changes, unchanged bindings
and counters, and label write failure. This is software upgrade coverage, not an
installed Homey upgrade or field acceptance. Three-phase feedback and hardware
release gates remain open. No publication, install, restart, battery or Energy
activation is authorised or performed by this cleanup.

## Dual CT picker consolidation — 31 October 2026

Local candidate supersedes the two-entry naming proposal below. New pairing has
one Smart Meter Dual CT entry: the existing property Energy driver with single-
phase or explicitly consented three-phase community-trial source selection,
per-phase details and optional CT2 display. CT2 is not included in property
Energy totals; qualification, overlap and freshness safeguards are unchanged.

The older detailed-monitor driver is deprecated in the manifest, hiding it from
new pairing while retaining its implementation, repair, capabilities and existing
paired devices. No automatic conversion, deletion or re-pairing is performed.
Raw diagnostic counters are not promoted to Energy totals. STREAM 5000 Home
Battery naming is retained for the driver and newly paired default names; existing
custom device names remain unchanged.

Validation: committed-lockfile npm ci on Node 22; all 1,343 tests, lint,
release:check and pinned Homey CLI 4.5.3 verified validation pass. The added
regression protects the single visible entry, legacy compatibility and phase/CT2
capability contracts. Hardware acceptance gates remain open. This is local source
only: no commit/push, publication, installation, Energy or battery changes.

## Driver naming clarification — 31 October 2026

Local presentation update distinguishes Dual CT detailed readings from Homey Energy;
these are roles, not separate phase-count drivers. Renamed the 5000 system driver
and new-device default to STREAM 5000 Home Battery. Existing device names/IDs,
counters, settings and Flows are not migrated. Test/Live/installed app unchanged.

## Test 1.11.14 / build 81 published — 31 October 2026

Combined candidate committed/pushed as `98110f7567e2a6300074d862991435bd2beece66`. Exact CI
https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41216647134 passed.
Node 22 locked install, all 1,342 tests, lint, release checks and pinned Homey
4.5.3 verified validation pass. Browser fixture clock setup was corrected after
the release run exposed a pause-in-the-past race. Archive SHA256:
`2ec5a0e1ffbc0d5d79420194d6739ba62ce24d591f8b86b8a30c83cde8021ca5`; runtime fingerprint:
`769e37db6b5a4929adb38a6c9b72c5014c254b3747ff69fb33f7810c3eb76ec1`. All 2,034 archive files match the clean committed
source build; unrelated local-AI workflow edits were excluded and preserved.

Test activation of build 81 and en/de/nl metadata are verified. Live stays
1.10.3/build 18. Read-only baseline/readback confirms installed Development
1.11.10 running with unchanged devkit session; 14 EcoFlow definitions/settings,
app settings, all device IDs, 101 Flow contracts and 1,204 Insights IDs preserved.
Whole-house device metadata differs outside EcoFlow; whole-house equality is not
claimed. No installation, restart, pairing, battery/Flow/Energy change occurred.
Mainline unchanged. No new hardware acceptance or 48-hour soak pass is claimed.

Authorised community reply sent and reopened: requests five-minute availability,
15–30-minute normal-use freshness/recovery, retained Dual CT totals and Energy
visibility on existing devices. No re-pair/reset, setting change or large capture.
Correspondence, screenshot proof and private receipts remain outside Git.
Field cause/recovery remains unconfirmed. Next: review feedback before more changes.

## Test 1.11.14 preparation authorised — 31 October 2026

Owner authorises committing/pushing the combined account/lifecycle candidate,
checking exact CI and publishing Test, then updating the community tester with
bounded existing-device tests. Live, Mainline and installed Development must stay
unchanged. Version 1.11.14 includes the prior fixes and fixed-label error logging.
Release checks also exposed a browser fixture clock race; setup now installs the
clock before its pause target. Hardware recovery and final-candidate soak remain
open. Publication awaits exact CI and archive/channel verification.

## Focused reliability bug bash — 31 October 2026

Completed the bounded offline review of authentication, mixed-device startup,
connection lifecycle, durable counter recovery and repeated recovery cycles.
Added four regressions: twenty concurrent failed sign-ins share at most one
attempt per allowed region and subsequently recover with one login; auth failure
logs exclude arbitrary upstream text; thirty failed-handshake/recovery cycles
retain both meter/battery consumers without accumulating managed timers or replaying
late frames; an applied checkpoint write whose acknowledgement fails restores the
durable total and starts a new anchor without double-counting or filling the gap.

Confirmed additional defect: auth/MQTT error logs forwarded arbitrary upstream
exception text. Those paths now use fixed failure labels, including app-owned
MQTT connect/reconnect/teardown logging. The new privacy assertions failed before
this fix and pass afterward. No claim of an actual credential disclosure is made.
The behavioral assertions in the new recovery/durability tests already passed;
no speculative accounting or connection-policy change was made for those cases.

Existing full-suite checks also cover original/ES21/ES22/Dual CT coexistence,
50 research-listener detach cycles, actual locked MQTT.js SUBACK rejection/retry,
bounded missing acknowledgements, stale callback isolation, single/three-phase
accounting, storage conflicts/readback failure and a synthetic 72-hour ledger
replay. These are simulated/offline checks, not field telemetry or heap profiling.

Combined candidate: Node 22 committed-lockfile installation (zero audit findings),
all 1,342 tests, lint, release checks and pinned Homey CLI 4.5.3 verified validation
pass. No new field recovery conclusion: sparse delivery and the reported original
aggregate outage remain unresolved in the field; final-candidate 48-hour hardware
soak remains outstanding. Keep them distinct from passing regression tests.

All changes remain local, uncommitted and unversioned on the diagnostic branch.
Previous fixes and unrelated local-AI workflow edits are preserved. Test, Live,
Mainline and installed Development remain unchanged. No hardware command, restart,
re-pair, setting/Flow operation or external message/capture request was performed.
Next: review/version the combined candidate for a separately authorised Test build,
then verify recovery with existing devices rather than adding speculative fixes.

## Connection lifecycle review candidate — 31 October 2026

Continued the shared-account candidate with an offline connection/recovery review.
The shared MQTT handshake now rejects pending consumers when its owned socket is
destroyed or shutdown begins, instead of waiting for a broker acknowledgement.
A regression failed before this change and passes afterward. STREAM 5000 subscription
retries now share one in-flight attempt, preventing overlapping timer callbacks
from racing subscription state. Generic connection failures no longer tell users
to change account credentials; missing data remains explicitly unknown.

Additional tests cover shutdown with concurrent consumers, repeated 5000 retry
calls, and a silent serial alongside another actively reporting serial. Original
STREAM source diagnostics now distinguish startup_unverified from an interruption
after successful verification and identity_changed. Existing source-binding gates
remain intact: no silent adoption of a new main, counter reset or re-pair shortcut.
The earlier same-source recovery and credential-order regressions still pass.

Review outcome by issue:
- Shared connection: authentication races and the above lifecycle defects fixed
  locally; no claim that screenshots identify the field broker failure.
- Sparse Dual CT: replay still expires honestly and recovers without backfill;
  silent-device isolation passes. The upstream reason for stopped publishing is
  unresolved. No stream-switch request or quiet-feed reconnect loop was added.
- Original aggregate: verified-source recovery passes; startup/identity blocks
  now distinguishable. The reported aggregate outage is not field-resolved.
- Error wording: generic transport failure no longer blames account settings.

The combined candidate passes Node 22 locked installation, 1,338 tests, lint,
release boundary checks and pinned Homey CLI 4.5.3 verified validation. Counter,
freshness and single-phase/three-phase regression suites remain green. Final
candidate hardware recovery and the 48-hour soak are NOT completed by these tests.
Changes remain local/uncommitted/unversioned. Test, Live, Mainline and installed
Development are unchanged. No hardware operations, external messages or new
capture requests. Existing local-AI workflow changes are preserved separately.

Next bounded step: review the combined source candidate before authorising a
versioned Test build. Field validation should retain existing devices/settings and
check sustained delivery, spontaneous recovery and counter continuity. If it still
fails, distinguish startup_unverified/identity_changed from transport failure using
the existing support report, rather than requesting another broad capture.

## Shared app-account recovery candidate — 31 October 2026

New community feedback on Test 1.11.13 reports both Dual CT devices and a physical
STREAM 5000 unavailable, plus the original aggregate. Other original devices
still display values, but their freshness is not established. This broadens the
investigation beyond CT1 interval admission. Screenshots establish unavailable
states, not a broker reason, credential rejection, or confirmed release regression.

Source-only fixes now share one saved-account authentication client per Homey and
exact credential set, bind broker-certificate decryption to the token used by the
successful request, and prevent a late old-token rejection from discarding a
newer session. Explicit pairing clients remain separate; removing/changing saved
credentials invalidates the cache. No account session is persisted or logged.

Two regressions failed on the prior implementation (independent saved-account
clients and certificate decryption during token rotation). Three new tests cover
shared concurrent/later login, credential removal/change and Homey isolation,
certificate response races, and late old-token rejection. Node 22 locked install
(audit clean), all 1,334 tests, lint, release checks and pinned Homey CLI 4.5.3
verified validation pass. No decoding, counter, freshness, overlap or hardware
control rules changed. This is not proof of the field cause or recovery.

Changes are local, uncommitted and unversioned on the diagnostic branch. Existing
AGENTS/local-AI workflow changes belong to other work and are preserved. Test,
Live, Mainline and installed Development are unchanged by this task. No repair,
re-pair, restart, setting, hardware request, new tester capture or message was sent.
Next: review this bounded authentication candidate before authorising a Test build;
confirm recovery on existing devices without counter resets. The original aggregate
failure and sparse delivery still require field confirmation; do not declare them
resolved from unit tests. Private report/screenshots remain outside Git.

## Test 1.11.13 / build 80 published — 31 October 2026

Owner authorised publishing the combined original STREAM recovery and Dual CT
connection-boundary fixes to Test. Runtime source
`8adf1908e0837c7531accdb98fc88161978d740f` is committed/pushed on the diagnostic
branch. Exact [CI 41200109882](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41200109882)
passed all checks. Local Node 22 locked install (audit clean), all 1,331 tests,
lint, release checks and pinned Homey 4.5.3 verified validation also pass.

Frozen archive SHA-256:
`3dd9fa290a430628d7a05d176f1afacd8c5e51ce3aa19193949abafda69f137c`.
Runtime fingerprint:
`f9d74cc3e15e99b8298488fc61e7769496d75f0c3b6fcea28f199825d21a85f5`.
All 2,034 packed files match the validated build; private/env/work/output paths
are excluded. Build 80 is confirmed active on Test as 1.11.13, with matching
en/de/nl listing and changelog. No certification/Live submission was performed.

Read-only baseline/readback confirms installed Development 1.11.10 running with
the same devkit session. All 14 EcoFlow device definitions/settings, app settings,
101 Flow contracts, 1,204 Insights identities and all device IDs are preserved.
Eight comparable cumulative capabilities are numeric and nondecreasing. Other
apps refreshed device metadata, so whole-house metadata equality is not claimed.
Existing owner CT1 is available on the unchanged installed runtime; this is not
an installed 1.11.13 hardware pass. Live remains 1.10.3/build 18; Mainline remains
`66b1cb5f828a53333739798281fce86125f61c28`.

[Sparse-feed investigation](DUAL_CT_SPARSE_FEED_INVESTIGATION.md) and
[original STREAM findings](ORIGINAL_STREAM_FREEZE_INVESTIGATION.md) retain their
limits: the field cause of sparse delivery remains unproven and full-release
hardware gates remain open. No install, restart, setting/Flow/battery command,
Energy change, repair or re-pair occurred. The community reply is a private draft
for owner review and has not been sent. Publication receipts, preservation data
and the draft remain outside Git.

## Test 1.11.13 preparation authorised — 31 October 2026

Owner authorises committing/pushing the combined original STREAM recovery and
Dual CT connection-boundary fixes, checking exact CI and publishing Test only.
This supersedes the prior Test publication hold; full-release/hardware gates
remain open. Live, Mainline and installed Development must remain unchanged.
A reply to the community tester must be drafted for owner review, not posted.

Candidate 1.11.13 preserves the evidence limits recorded below: sparse delivery
is reproducible but its field cause is unproven. No automatic meter requests,
forced reconnects, counter resets, re-pairing or Energy/settings changes are added.
Publication awaits final checks, exact-commit CI and frozen archive verification.

## Sparse Dual CT feed reproduced; release remains on hold — 31 October 2026

The latest private, manually transcribed support extract establishes accepted
subscriptions and an admitted CT1 anchor followed by genuinely stale delivery.
It does not establish why publishing stopped. A generated three-frame replay
matches the reported acceptance/rejection classifications and zero eligible
coverage; it is a possible sequence, not the actual packet chronology. Missing
power remains unknown, counters stay unchanged and sustained fresh delivery
recovers on the existing subscription without backfill.

A separate confirmed defect allowed a fast socket replacement with increasing
sequences to integrate across the interruption. Local connection epochs now
invalidate the crossing interval and use the existing in-place anchor reset.
Single-phase and three-phase import/export regressions protect checkpoints,
freshness and normal recovery. This is not claimed to solve the field feed stall.

[Investigation and evidence limits](DUAL_CT_SPARSE_FEED_INVESTIGATION.md) records
the findings. Node 22 locked install, all 1,331 tests, lint, release checks and
pinned Homey 4.5.3 verified validation pass locally. Published-guard comparison
confirms the new accounting regression fails before the fix. Changes remain
local/uncommitted/unversioned; prior original STREAM fixes are preserved. Release
is on hold; Test, Live, Mainline and installed Development remain unchanged.
No restart, hardware request, settings change, new tester capture or message.

## Original STREAM freeze recovery candidate prepared — 31 October 2026

Latest original STREAM feedback confirms freezing persists on 1.11.12. The new
manual diagnostic matches that version but contains startup logs only, so it does
not establish the event's root cause or a process crash. No new reply/capture,
remote operation or hardware action was performed for this investigation.

Confirmed source defects: a transient aggregate-main lookup failure permanently
latched telemetry off, even after fresh same-source verification; rotated API
credentials were refreshed only after that prerequisite lookup; MQTT availability
could claim online while the binding gate suppressed quota application. Candidate
allows telemetry polling to recover only the previously session-verified same
source, refreshes credentials first, and keeps changed/unverified identities and
controls blocked. Totals/raw baselines are retained and power gaps are not filled.
Fixed log classifications and whitelisted recovery counts make future evidence
useful without publishing household data. Late old-session lookup results cannot
invalidate a newer initialized session.

[Investigation and regression evidence](ORIGINAL_STREAM_FREEZE_INVESTIGATION.md)
records the limits. Local Node 22 locked install, all 1,327 tests, lint, release
checks and pinned Homey 4.5.3 verified validation pass. Six new regression cases
cover recovery, changed identity, credential ordering, accounting, privacy and
lifecycle safety. Changes are local, uncommitted and unversioned. Test 1.11.12,
installed Development 1.11.10, Live 1.10.3 and Mainline remain unchanged; no new
field pass or exact-commit CI is claimed.

## Test 1.11.12 / build 79 published — 31 October 2026

Owner authorised publishing the reviewed shared-delivery fixes to Test for the
community tester. Runtime source `2014544ebada21aee14bdbe6658370ea7c59bf18`
was committed/pushed on the diagnostic branch. Exact
[CI 41192102541](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41192102541)
passed all 1,321 tests, lint, release checks, dependency audit and pinned Homey
4.5.3 verified validation. Local Node 22 committed-lockfile checks also passed.

Frozen archive SHA-256:
`f2268ac273f63e53c9a8b0cb8bac2ae8ea4218cf662000e7bdf2e2a5d883dec2`.
Runtime fingerprint:
`4e6de1f92449e39ce46fa8631d3eb83772e280523b7a5c5d381e4754c80765e3`.
All 2,032 archive files match the validated build; private/env/work/output paths
are excluded. Build 79 is confirmed active on Test as 1.11.12, with matching
en/de/nl listing and changelog. No certification/Live submission was performed.

Read-only publication baseline/readback confirms installed Development 1.11.10
running with unchanged devkit session; all 14 EcoFlow device definitions/settings,
app settings, 101 Flow contracts, 1,204 Insights identities and all device IDs
are preserved. Unrelated devices refreshed their own diagnostic metadata, so the
whole-house metadata hash differs; EcoFlow definitions match exactly. No install,
restart, battery command/setting, Energy-source change, Flow action, repair or
re-pair was performed. Live remains 1.10.3/build 18; Mainline remains
`66b1cb5f828a53333739798281fce86125f61c28`.

[Shared-delivery bug-bash findings](DUAL_CT_SHARED_DELIVERY_BUG_BASH.md) describe
what changed and what remains unproven. The prior 1.11.11 field recovery failure
is retained; this publication is not a new field pass. Community validation still
needs to establish actual delivery/rejection status and sustained three-phase
recovery/accounting. No new capture or external reply was requested/sent in this
publication task. Private upload/activation receipts and preservation evidence
remain outside Git. Existing paired devices and counters should be retained.

## Test 1.11.12 preparation authorised — 31 October 2026

Owner authorises publishing the reviewed shared-delivery bug-bash fixes to Test
for community validation. Candidate 1.11.12 retains the findings below and awaits
exact-commit CI, frozen-archive checks and channel verification. Installed
Development 1.11.10, Live 1.10.3 and Mainline must remain unchanged. No hardware
acceptance, new tester capture or external message is implied by publication.

## Shared Dual CT delivery bug bash prepared — 31 October 2026

The tester reports 1.11.11 did not restore either the older detailed monitor or
three-phase Energy meter, although native readings update. This is negative field
recovery evidence; the previous software fixes are not claimed to have solved it.

A source-only candidate fixes premature readiness for concurrent MQTT consumers
and failed/unanswered subscription handling: 10-second SUBACK deadlines, at most
three per-topic attempts with 5/10-second retry delays, no shared-socket reset,
and cancellation/identity fences for stale acknowledgements and teardown. Exact
receive-topic scoping and listener-error privacy are hardened. Whitelisted local
support evidence distinguishes topic acceptance, no incoming delivery and monitor
encoding/header/decode rejections without raw data or automatic upload.

Two regressions fail on published source and pass here; an actual locked MQTT.js
v5 in-memory broker test confirms a denied subscription is retried on the wire and
both listeners recover. Local Node 22 locked installation, all 1,321 tests, lint,
release checks and pinned Homey 4.5.3 verified validation pass. Existing single-
and three-phase accounting/counter/staleness tests remain intact.

[Bug-bash findings and upstream review](DUAL_CT_SHARED_DELIVERY_BUG_BASH.md) explain
the remaining field gate. The Home Assistant BK21 parser is useful protocol
research, not a Dual CT hardware contract. No alternate decoding, GET/SET request,
Energy-accounting change, new capture or community reply was performed. Candidate
is uncommitted/unversioned; Test 1.11.11, installed Development 1.11.10, Live and
Mainline were not changed. Separate review is needed before another Test release.

## Test 1.11.11 / build 78 published — 31 October 2026

Owner authorised immediate Test publication for community recovery testing and
replies. Runtime source `5e326c910be50194a937747e9c7c53cb097c4268` was committed
and pushed on the diagnostic branch. Exact [CI 41189319263](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41189319263)
passed all 1,311 tests, lint, release checks, full audit and pinned Homey 4.5.3
verified validation. The frozen archive contains 2,028 files matching the validated
build and excludes private/env/work/output paths. SHA-256:
`8992d8fef6250a23dddcfaddceb6bd57b594aec32b22d8bd97adeeb5f9a213f0`.
Runtime fingerprint: `fdd7e89a2d6d3310968e4773c7aefa20b3f00bdf9bfe983ab2294baa116be225`.

Build 78 is confirmed active as Test 1.11.11; en/de/nl listing and changelog match
the source. Live remains 1.10.3/build 18. Installed Development remains running
1.11.10 with the same devkit session. Read-only before/after checks preserve all
14 EcoFlow device definitions/settings, app settings, 101 Flows, 1,204 Insights
identities and all device IDs. One unrelated device refreshed its own debug sync
timestamp; that is not an EcoFlow preservation failure. No installation, restart,
battery/Energy setting, Flow action, repair or re-pair was performed here.
Mainline remains `66b1cb5f828a53333739798281fce86125f61c28`.

Authorised private tester and public freeze-report replies were posted, signed JZ,
and reopened to verify. They distinguish confirmed source defects from unproven
field causes, request an in-place update/normal-use observations and preserve
existing devices/counters/settings. No additional diagnostic capture requested.
Private receipts and preservation evidence remain outside Git. Current recovery,
three-phase complete-frame coverage and import/export reference acceptance still
await community evidence; this Test publication is not a full-release signoff.

## Test 1.11.11 preparation authorised — 31 October 2026

Owner requests immediate Test publication for the community tester and a reply to
the public freezing report. Version 1.11.11 contains the source recovery fixes
below. Installed Development 1.11.10, Live 1.10.3 and Mainline must remain unchanged.
Publication is pending exact-commit CI and archive/channel verification. No hardware
acceptance is inferred from software validation; no new tester capture requested.

## Community recovery fixes prepared in source — 31 October 2026

Uncommitted diagnostic-branch candidate only; installed Development and store
Test remain 1.11.10, Live remains 1.10.3. No install, restart, settings/Flow change,
community reply or new tester capture was performed for this investigation.

The earlier three-phase detailed monitor did produce readings. That evidence is
not a completed three-phase Homey Energy acceptance pass. The newer Energy path
requires coherent CT1 phases plus total in the same payload and qualified live
intervals; the detailed monitor can retain separately received display fields.
The latest field screenshots show both the detailed monitor and Energy device
unavailable, so a phase-only decoding regression is not established.

Confirmed source defect: a five-second delivery gap, sequence reset or clock
discontinuity unnecessarily tore down the Energy subscription and entered its
30-second-or-longer reconnect backoff. Recovery now clears only the delivery and
accounting anchors in place. The crossing packet is discarded; the next qualified
frame anchors, and only a following valid interval advances counters. Persisted
precise checkpoints and writer ownership remain intact. Five-second freshness,
complete-phase checks, retained/duplicate rejection and missing-data handling are
unchanged. Three-phase local feedback now records bounded delivery rejection
reasons without raw payloads, measurements, identifiers or automatic uploads.

The original STREAM public MQTT client also lacked replacement-socket fencing
and listener isolation already present on the app transport. The candidate fences
old messages/disconnects, shares subscriptions, isolates throwing listeners and
resubscribes surviving status-only consumers. These are confirmed implementation
defects; the sparse field report does not establish them as the freeze's cause.
The latest edited public freeze report names 1.11.10, but its diagnostic metadata
identifies 1.11.6. Preserve that chronology distinction when following up.

Node 22 locked `npm ci` (zero audit findings), all 1,311 tests, lint, release
boundary/ledger checks and pinned Homey 4.5.3 verified validation pass locally.
Regression coverage includes both phase modes across gaps, exact and rounded
counter continuity, restart restoration, duplicate rejection, shared listeners,
old-socket callbacks and status-only resubscription. Hardware gates remain open:
current community delivery cadence/payload completeness, sustained recovery and
three-phase import/export reference accounting. No field pass or exact new CI is
claimed. Review this source candidate before versioning/publication/installation.

## Development and Test 1.11.10 deployed — 31 October 2026

Owner explicitly instructed deployment despite the explained coordinator hold.
The frozen archive from source `9217c3e38bb4088ff7cbd2654037fd42703b55e6`
was installed non-clean as Development 1.11.10. Readback confirms running,
aggregate SOC 0% through the official cloud-report fallback, 14 device identities
and existing settings/capabilities preserved (additive Dual CT display capabilities),
101 Flow contracts, 1,204 Insights identities and ten nondecreasing counters.
Native phone favourite-tile rendering remains to be confirmed by the owner.

The restart was followed by Office reserve restoration to its watchdog baseline
and a coordinator ownership fault. This is the risk explained before the owner's
explicit override; no separate battery command or fault clear was performed.
Do not claim battery settings or coordinator state were preserved. Recovery
requires separate owner review; do not silently restore reserves or clear faults.

After local app validation, the same archive was uploaded and activated as
Test 1.11.10/build 77. Store metadata matches committed en/de/nl listing/changelog.
Live remains 1.10.3/build 18; Mainline is unchanged. Source CI 41160015772 passed
all 1,308 tests, lint, release checks, full audit and pinned verified validation.
Private installation/store receipts, baseline/readbacks and fault evidence remain
outside Git. The previous held-deployment checkpoints below are historical.


## 1.11.10 exact CI/archive ready; local-first deployment held — 31 October 2026

Runtime source `9217c3e38bb4088ff7cbd2654037fd42703b55e6` is committed/pushed on
the diagnostic branch. Exact [CI 41160015772](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41160015772)
passed all 1,308 tests, lint, release checks, full dependency audit (zero findings)
and pinned Homey 4.5.3 verified validation. Local locked-tooling checks also pass.
The development matcher compatibility bridge has regression coverage for actual
legacy import-rule allow/deny behaviour as well as callable/named matcher APIs;
audit was not weakened and prior lint file coverage is retained.

Frozen 1.11.10 archive SHA-256:
`6b06405b7a1ff8c0755377f671c9aeb3285f01f5015a5097f205641cd539adab`.
Runtime fingerprint: `50b89f04742d0ba4829a5a27a024571b517819e38a545ba05966671fbd19d370`.
All 2,027 packed files match the validated build; private/env/work/output paths
were excluded. The private manifest/archive and preservation baseline are outside
Git. Do not rebuild/substitute this archive silently during maintenance.

Fresh preflight confirms installed Development 1.11.5 running, Test 1.11.9/build
76, Live 1.10.3/build 18, 14 EcoFlow devices, 101 Flows and 1,204 Insights identities.
The coordinator is actively renewing a reserve hold above restoration level.
Battery power is idle, but the control lease is not: a restart may lose guard
freshness and initiate restoration. Installation was not attempted. A request
for permission to contact the automation task is pending; no message, runner
pause, reserve release or battery-setting change has been performed here.

The forecast first suggests 17:00–17:30 GMT for natural release, subject to
replanning and fresh validation. Preserve the owner-requested order: non-clean
Development update with preservation/SOC readback first, then publish the same
candidate to Test only after local validation passes. No Test upload/activation
has been attempted. Mainline remains `66b1cb5f828a53333739798281fce86125f61c28`.
This is a ready software candidate and a held deployment, not installed UI or
hardware acceptance. SOC still needs native favourite-tile verification after
an approved safe installation window.


## Development 1.11.10 then Test preparation authorised — 31 October 2026

Versioned local checks completed: all 1,308 tests, lint, release checks, full
dependency audit (zero findings) and pinned Homey verified validation pass.
Native deployment is still blocked by the active coordinator hold. No hardware
acceptance or local UI restoration is claimed by these software results.

Owner authorised non-clean local Development deployment of the SOC candidate,
validation and subsequent Test publication; Live/Mainline remain unchanged.
The archive will include the already reviewed 1.11.6–1.11.9 changes that have
not yet been installed on this Homey. Do not delete/re-pair or reset counters.

Read-only preflight found an active Office reserve hold above its restoration
level. Restarting EcoFlow could trigger a reserve restoration, so installation
is blocked while that lease remains active. The forecast's first candidate
natural-release interval is 17:00–17:30 GMT; this is not an idle guarantee.
A coordination-message approval is pending. No runner pause, lease release,
battery change, installation or Test publication has occurred in this checkpoint.

The new development-tooling advisory was remediated without disabling audit:
all development minimatch resolutions use patched 11.0.1. A development-only
lint wrapper adapts its namespace export to the callable API expected by legacy
ESLint plugins; the patched implementation and named/static APIs are retained.
All 145 previously linted files remain covered. Production dependencies and
runtime use are unchanged. Full and production audit now report zero findings.
The earlier 20-finding checkpoint below is historical. Exact versioned tests,
CI, archive, final preservation baseline, idle checks and readback remain required.


## Official 5000 SOC comparison and local recovery candidate — 31 October 2026

Two read-only public quota reads returned explicit system SOC 0%, matching the
physical ES21 monitor. Main resolution returned the paired ES21; the app-protocol
aggregate SOC was expired/null. Public reads have no hardware measurement time.
A source-only fallback now reads the main reporter's documented SOC when aggregate
SOC is unusable, rechecks reporter identity, protects newer app readings and
applies SOC alone. Physical units, power, availability and cumulative accounting
are unchanged. Existing Developer credentials are required; none were altered.
Diagnostics distinguish latest-cloud-report evidence from hardware freshness.

All 1,306 tests, lint, release checks and pinned Homey 4.5.3 verified validation
pass after locked Node 22 tooling. Production audit has zero findings; full audit
reports 20 moderate findings in existing development tooling. No dependency/lock
changes were made. See `docs/STREAM_5000_API_REVIEW.md` for the candidate contract,
regression coverage, audit limitation and remaining installed/hardware gates.

Changes remain local/uncommitted and unversioned after 1.11.9; earlier official
reference documentation edits are preserved. No archive, source push/CI,
publication, installation, restart, re-pairing, Energy/source switch, battery
command/setting or Flow execution occurred. Installed Development 1.11.5 was
read-only checked. Last verified Test 1.11.9/build 76 and Live 1.10.3/build 18
remain unchanged by this work. No raw household evidence or correspondence is
included in Git. Review the source candidate before any Development deployment.


## Official 5000 API reference retained — 31 October 2026

Owner requested preserving the official [STREAM 5000 API path](https://developer-eu.ecoflow.com/us/document/PP3?id=2115695633708867585).
Re-read the full page and updated `docs/STREAM_5000_API_REVIEW.md` and model
coverage references. Public HTTP/Open-MQTT support is now documented for the
5000 family; earlier absence-of-documentation conclusions are historical.
Existing app-account decoding has not been converted to this API, and no live
quota request or hardware validation was run in this documentation task.
The page still does not establish a product-421 Dual CT contract. A focused
reply about supported interfaces, firmware, phase/netting semantics, freshness
and native counters is proposed for owner review, not sent or saved in Outlook.
Private correspondence stays outside Git. These documentation edits remain
local/uncommitted; no runtime, Test, Live, Mainline or installed-app change.


## Test 1.11.9 / build 76 active; Development unchanged — 30 October 2026

Owner-authorised combined named-overlap and shared-subscription fixes were
committed/pushed as `7cb0412f4dbb165548c3f40042ff005fddb6a3ee` on the diagnostic
branch. Exact [CI 41144306551](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41144306551)
passed all 1,295 tests, lint, release checks, dependency audit (zero known
vulnerabilities) and pinned Homey 4.5.3 verified validation. The same checks passed
locally using the committed lockfile and Node 22.23.4. Hardware gates remain open.

**Test 1.11.9/build 76** was uploaded and activated, then confirmed by Apps API and
portal. English/German/Dutch listing and changelog match the committed text.
[Test installation link](https://homey.app/a/uk.co.zarb.ecoflow/test/).
No certification or Live publication was submitted.

- Runtime fingerprint: `8f26c96ba03ea8e7b57e91a9b6f8e45cae550fad2b8dd37d8fb064625f2693b4`.
- Uploaded archive SHA-256: `9a7a68c53e82e4839fc239a72244bb9b7680667a7509ad5a504e3466fa2f715d`.
- Processed download SHA-256: `9346e56d4d2116c318054308b534b0bd9c4dcc54e3899255a497dee160e38c02`.
- All 2,023 packed files matched the validated build; 2,022 processed files remain
  byte-identical. The only difference is Homey's removal of author email from
  `app.json`; parsed manifests otherwise match. Private evidence stays outside Git.

Fresh before/after readbacks confirm **Live 1.10.3/build 18**, installed
**Development 1.11.5** running from the same devkit session, 14 unchanged EcoFlow
device definitions/settings/capabilities/Energy metadata, 101 unchanged Flow
contracts, 1,204 unchanged Insights identities and ten nondecreasing cumulative
counters. Mainline remains `66b1cb5f828a53333739798281fce86125f61c28`.
App settings match except the background `houseReserveLease` hash, which changed
during observation; this release performed no Homey setting writes. Unrelated
apps refreshed diagnostic settings. Do not describe all household settings as
byte-identical or infer a battery setting change from that hash alone.

No local installation/restart, re-pairing, Energy/source switch, counter rewrite,
battery command or Flow execution was performed. The maintenance installation
remains held pending fresh approval. These are software fixes, not proof of the
community report's root cause or a three-phase hardware pass. Next field check:
observe the existing detailed monitor and property Energy meter after the Test
update, without deleting/re-pairing or weakening freshness/accounting guards.
No tester message or request for further captures was sent in this release task.


## Test 1.11.9 preparation authorised — 30 October 2026

Owner authorised deploying the combined named-overlap and shared-subscription
fixes to Test. Version 1.11.9 and English/German/Dutch release notes are prepared.
The diagnostic branch was fetched and was in sync before this release work;
existing local fixes are preserved. Exact final checks, source commit/push, CI,
archive and Test activation must each be verified before declaring publication.
Do not promote hardware acceptance based on software checks. Live, Mainline and
the installed Development app remain outside this publication approval. No
installation, restart, device/account/Energy/Flow/battery change is authorised.


## Shared Dual CT subscription/freshness fixes prepared — 30 October 2026

Source-only investigation reproduced three defects: explicit same-account pairing
rewrote credential settings and stopped listeners; adding another same-serial
consumer repeated broker subscriptions; callbacks from replaced sockets could
reach current listeners with a new receipt time or tear down the new connection.
The fixes make credential commit idempotent, subscribe once per active serial,
and fence old connection callbacks. Actual credential changes still stop
consumers. Independent listener removal and reconnect restoration are preserved.

All 1,295 tests pass after locked `npm ci` on Node 22.23.4, including the pending
named-overlap work and an actual detailed-monitor driver/settings-event test.
Lint, release checks, pinned Homey 4.5.3 verified validation and whitespace checks
pass. Five-second Energy freshness, retained/duplicate rejection, phase/source
qualification, no-gap-backfill accounting and persisted counters are unchanged.
See `docs/DUAL_CT_SHARED_SUBSCRIPTION_REVIEW.md` for reproduced defects and scope.

The community's latest report shows both monitor and Energy unavailable; its
native phase sum is consistent, but fresh delivery into Homey is unproven. These
software fixes are not a confirmed field root cause or hardware acceptance.
The earlier overlap blocker was subsequently identified by the tester as another
included Energy meter; the named-overlap source work remains intact.

All pending changes remain local/uncommitted and unversioned after Test 1.11.8.
No archive, source push/CI, publication, install/restart, re-pairing, counter
rewrite, Energy/battery/Flow change or tester request was performed. Test, Live,
Mainline and the installed app were not changed or freshly polled in this task;
last verified states remain Test 1.11.8/build 75, Live 1.10.3/build 18 and installed
Development 1.11.5. The maintenance installation remains held.


## Named Dual CT overlap feedback prepared for review — 30 October 2026

Owner requested identifying the blocking meter by name, regression coverage and
source preparation only. The local pairing page now lists bounded device names
from the same fresh overlap decision, with translated missing-name/additional-count
handling. No exclusion, migration, re-pairing, qualification bypass or accounting
change is made. Names are local UI feedback, rendered as text and excluded from
source binding/inventory authority hashes. No device IDs/raw errors or automatic
uploads are added. The detailed beta monitor remains non-contributing.

All 1,291 tests, lint, release checks, pinned Homey 4.5.3 verified validation and
whitespace checks pass. See `docs/DUAL_CT_OVERLAP_DEVICE_REVIEW.md` for the exact
scope, synthetic mobile preview and remaining native evidence gap. The current
field screenshot does not identify the actual blocker; do not invent it or ask
for deletion based on the participant's earlier beta status alone.

Changes remain local/uncommitted and unversioned after published Test 1.11.8.
No archive rebuild, commit/push, CI run, publication, installation, Homey/Flow/
battery/Energy mutation or tester message was performed. Last verified channel/
installed states remain Test 1.11.8/build 75, Live 1.10.3/build 18, Development
1.11.5; these are prior readbacks, not fresh live polling in this source-only work.
The maintenance installation remains held under the owner's unchanged-app limit.


## Corrective Test 1.11.8 / build 75 active; local installation held — 30 October 2026

Owner-authorised runtime source `752e3acebc7c5d30f455336a825deb1dfa7688ae` was committed/pushed on
`codex/mixed-generation-reporting-diagnostics`. Exact CI
[41132995305](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41132995305)
passed locked Node 22 tooling, all 1,284 tests, lint, release checks, dependency
audit (zero known vulnerabilities) and pinned Homey 4.5.3 verified validation.
The same checks passed locally. No hardware acceptance ledger was promoted.

Archive SHA-256: `dd762a2c8bd64b48aeab293e7f843e53d682bb3fe06aaf1938da1fea7a8ed257`.
Source runtime fingerprint: `d2bf83eda994f01f713b0e88f013f5128681fd18171d3ed00c8e0d078150ac33`.
The archive was content/version/privacy checked, uploaded and activated only as
**Test 1.11.8/build 75**, verified through API and portal. Build readme/changelog
match the committed English/German/Dutch text. Published download SHA-256:
`a1117352b68f06a18991bdf56038dc3da96dfd921794fd0e4f9c2cd90a9def85`. All 2,020 file paths match the upload; 2,019 file bytes are identical.
Only `app.json` differs, with Homey's author-email removal and no other field
change. Keep server repack provenance distinct from the source fingerprint.

Fresh before/after readbacks confirm installed **Development 1.11.5**, the same
devkit session, 14 EcoFlow device definitions/settings, 101 Flows and 1,204 Insights
identities. All 10 comparable cumulative counters remain numeric/nondecreasing.
App-setting difference is the concurrently renewed coordinator lease; unrelated
integration device settings also changed during observation. No application-wide
byte-equality claim. **Live 1.10.3/build 18 and Mainline unchanged.** No local
installation/restart, battery command, Flow execution, pairing or Energy change.

The authorised private reply was sent and reopened, signed JZ, with the new Test
link and one targeted request for the newly visible message if setup still fails.
No raw diagnostics or private correspondence is committed. The underlying field
verification blocker remains unconfirmed; software feedback/wording fixes are not
proof that the three-phase field pairing succeeds. Native/recovery/accuracy/soak
gates remain open.

The maintenance heartbeat retains its date/time but now explicitly defers under
the latest owner instruction to keep installed Development unchanged. It must not
install superseded 1.11.7 or substitute 1.11.8, pause the coordinator or release
reserves without fresh exact-candidate installation approval. Test publication
is not that approval. Earlier expedited-maintenance consent does not override
this later boundary.


## Corrective Test 1.11.8 prepared for authorised delivery — 30 October 2026

The owner authorised preparing, committing/pushing and publishing the pairing-review
correction to Test, then replying in the existing private tester conversation.
Live and installed Development must remain unchanged. No installation, runner
pause, reserve release, re-pairing or Energy change is included in this delivery.

Version 1.11.8 adds visible/bounded review feedback, fixed translated failure-stage
messages and mode-correct three-phase scope consent. Existing firmware/source/
overlap checks and single-phase/counter behaviour remain unchanged. Packaged
English/German/Dutch Dual CT store text now matches the reviewed build-74 listing;
this corrects the older packaged three-phase exclusion without changing the trial
scope. It does not complete hardware acceptance or identify the field backend
blocker. Exact CI/archive/publication and preservation results will be recorded
separately after delivery. The old 1.11.7 maintenance installation remains held;
publication approval is not permission to install 1.11.8 locally.


## Dual CT pairing review correction prepared; local installation held — 30 October 2026

The owner interrupted expedited maintenance to review new pairing feedback.
No runner pause, reserve release or installation had yet occurred. Test remains
1.11.7/build 74, Live 1.10.3/build 18 and installed Development 1.11.5.

Confirmed mobile review feedback/timeout defects and single-phase wording on the
three-phase confirmation. Added visible progress and a 30-second fail-closed
review deadline, bounded translated failure classifications and mode-correct
scope consent. Three new regressions fail before the change; all 1,284 tests,
lint, release checks and pinned Homey verified validation pass afterward. The exact field backend blocker is still
unidentified; do not claim a firmware/wiring fault or a completed field fix.
See `docs/DUAL_CT_PAIRING_REVIEW_FEEDBACK.md` for scope and evidence boundaries.

Changes are local, unversioned and not committed/published/installed. The old
approved archive is unchanged; do not substitute this tree or install 1.11.7
while the corrective review is pending. The scheduled maintenance must defer
until the candidate/issue is reviewed. No battery, Flow, Energy or portal setting
changed and no reply or further capture request was sent during investigation.


## Test 1.11.7 / build 74 published; Development unchanged — 30 October 2026

The owner explicitly authorised publishing the combined candidate to Test before
the pending Development maintenance validation, then replying to the tester.
Exact runtime source `5a59e97aefb9aae2445809028a0b4c4dff2569ea` was freshly checked
against successful CI 41123399129. The approved archive SHA-256
`f41f5d4b35a476e8440d7327936333338ac7ef814023921cb5657a024a8414e1` was uploaded,
and **Test 1.11.7/build 74** was activated and verified through API and portal.
Live remains **1.10.3/build 18**; no Mainline change, certification or local install.
The native display/widget, recovery, independent accounting and soak gates remain
open. Publication is opt-in Test delivery, not full-release hardware acceptance.

The build-specific store metadata now includes the reviewed English/German/Dutch
Dual CT community-trial wording and 1.11.7 changelog. Other listing paragraphs were
retained. Packaged README files and the approved maintenance archive are unchanged.
Homey's downloadable repack has SHA-256
`4c361ba7b15f9f0004d6e22a5b6add81187ee01bf12d786dc25f5107b5d9099d`.
All 2,018 file paths were compared: 2,017 file bytes match, with only Homey's removal
of the author email from `app.json`. No other manifest field differs. Keep this
server packaging distinction separate from the source runtime fingerprint.

Before/after readbacks confirm running Development **1.11.5**, unchanged devkit
session, all 14 EcoFlow device definitions/settings, 101 Flows and 1,204 Insights
identities; all 10 comparable cumulative counters are nondecreasing and remain
numeric. App settings differ only in the concurrently renewed reserve lease;
one unrelated integration's device settings changed during observation. Do not
claim an all-app/all-device byte-equal snapshot. No Homey setting/Flow/control was
written by this publication operation. Private evidence remains outside Git.

The authorised reply was posted and reopened in the existing private tester
conversation, signed JZ, with the Test link, separate new-device three-phase
accounting choice, optional display layout, CT2 exclusion and bounded first
feedback request. No private message content or household data is copied here.

The conditional 31 October 17:05–17:25 GMT maintenance window remains unchanged.
Its existing heartbeat's expected Test baseline was updated to 1.11.7/build 74;
archive/source/CI, natural-release checks, approved runner pause/resumption and
no-battery-changes conditions are unchanged. Use fresh baselines at execution;
do not treat the pre-publication Test 73 snapshot as the current channel guard.


## 1.11.7 release preparation reconciled — 30 October 2026

Added `docs/RELEASE_1_11_7_READINESS.md` as the current Test/native/production
checklist; the October 25 checklist is explicitly historical. Fresh dependency
audit reports zero known vulnerabilities and release-boundary checks pass.
The approved archive hash and runtime fingerprint remain unchanged. Full hardware
readiness still deliberately fails; no acceptance ledger or gate was weakened.
No runtime change or repeat of the already-passing 1,279-test suite is claimed.

Prepared Test changelog, conditional delivery checklist and a not-started soak
plan. The packaged store description predates the opt-in three-phase trial;
replacement English/German/Dutch text is prepared privately for review, not applied.
Changing packaged copy requires a separately reviewed archive; the approved
maintenance archive is frozen. Robert's approved invitation was sent and reopened
in the existing private thread; correspondence remains outside Git.

No Homey/portal mutation, installation, restart, re-pairing, Energy/battery setting,
Flow execution, publication or new automation. Existing conditional maintenance
approval/window below remains unchanged. Last verified channel/install states
are historical readbacks, not newly polled by this documentation preparation.


## Development 1.11.7 installation deferred to approved conditional window — 30 October 2026

The owner approved one non-clean installation of the exact combined candidate and
widget/display/counter validation, with Test/Live unchanged and no re-pairing or
battery changes. Fresh preflight verified the archive/CI and captured 14 EcoFlow
devices, 101 Flows and 1,204 Insights identities. Installation has **not occurred**:
the live reserve coordinator is renewing an active preservation lease, and startup
could invoke the unchanged watchdog's guard-loss/restoration branch.

The owner authorised a coordination request to the HomeyPro task. Its read-only
review confirmed no safe current window under the no-battery-changes restriction.
The owner then approved one conditional maintenance window on **31 October 2026,
17:05–17:25 Europe/London (GMT)**. A single current-thread heartbeat is active:
`ecoflow-1-11-7-conditional-maintenance`. The forecasted slot is not a guarantee.

Proceed only after fresh natural-release, completed/nonfaulted lease, empty-intent,
clear-run-lock, native ownership and whole-window policy checks. Approval additionally
covers temporarily disabling only the dedicated execution Flow/configuration after
natural release, then restoring its previous enablement only after successful native
validation. Preserve gate, lease/fault history and expected ownership. Do not force
release, edit/renew leases, command batteries or clear faults to create a window.
If unsafe or drifted, defer without changes and report; no automatic retry window.

Use only source `5a59e97aefb9aae2445809028a0b4c4dff2569ea`, exact successful CI
41123399129 and archive SHA-256
`f41f5d4b35a476e8440d7327936333338ac7ef814023921cb5657a024a8414e1`.
Do not rebuild/substitute a later working tree or repeat an uncertain install.
Private review/validation instructions and baseline remain outside Git. Installed
Development remains 1.11.5; Test 1.11.6/build 73 and Live 1.10.3/build 18 were unchanged
at preflight. No runner/Flow/settings/lease/battery mutation has been performed here.


## Combined 1.11.7 display and availability candidate — 30 October 2026

Owner authorised adding the availability fix with regression tests while keeping
Test, Live and installed Development unchanged. Normal projections no longer mark
a healthy meter unavailable. Newer committed checkpoints trigger bounded immediate
catch-up instead of blanking fresh power until the next tick. Source/consent/runtime
checks remain after asynchronous SDK work. The last projected power retains its
own receipt deadline; an independent coalesced expiry clear can run while an SDK
counter write is stalled. Late callbacks and failed clears cannot silently revive
stale power. No checkpoint format, counter arithmetic/rounding, binding, delivery
threshold, reconnect policy or capability identity is changed.

Locked Node 22 install, all 1,279 tests, lint, release checks and pinned Homey CLI
4.5.3 verified validation pass. Regression coverage includes display settings, both
wiring paths, precise counter
continuity, overlapping SDK updates, five-second expiry, stalled writes/late callbacks
and clear retries. See `docs/DUAL_CT_AVAILABILITY_CANDIDATE.md` and the display review
for implementation, limits and native acceptance needs. The combined archive replaces
the earlier display-only 1.11.7 review artifact; neither has been installed/published.
Widget/client behaviour remains hardware-unverified until an approved installation.
No battery/settings/Flow/paired-device operation or forced gap/reconnect occurred.


## Dual CT display candidate 1.11.7 prepared — 30 October 2026

Owner requested source implementation for review, keeping installed Development,
Test and Live unchanged. Added independent CT1 single/three-phase display, optional
CT2 display and detailed-monitor diagnostics settings. Legacy monitor defaults
retain its existing layout. Energy defaults follow the paired accounting mode
with CT2 hidden; core power/import/export stay present and new auxiliary readings
use the existing subscription. Display selections never change accounting mode,
consent, source binding, counter checkpoints or the qualified firmware registries.

Cards are hidden/shown through capability options; no existing capability IDs,
history or Flow references are removed. Hidden cards keep receiving normal values;
custom titles/options are retained. New details remain display-only with existing
privacy fences. Independent receipt ages expire details within 90 seconds; core
Energy delivery stays on its existing five-second rules. No V×A inference or
voltage/current phase summation. Optional SDK/display failures are isolated from
core Energy. The separate reconnect/status-flicker proposal is not implemented.

See `docs/DUAL_CT_DISPLAY_CANDIDATE.md` for household layouts, preservation design
and native UI/preservation checks requiring a later approved installation. Locked Node 22 install, all 1,271 tests, lint, release checks and pinned Homey
CLI 4.5.3 verified validation pass. Full hardware readiness remains blocked.
This candidate is not installed or published; native show/hide remains unverified.


## Three-phase community Test 1.11.6 / build 73 active — 30 October 2026

The owner authorised implementing and publishing the opt-in community Test trial.
Exact source `4b1218cd2e5819557d6f76ea84eb369c9e9b46a9` passed CI
[41110353477](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41110353477),
all 1,261 tests, lint, release checks and pinned Homey CLI 4.5.3 verified validation.
The verified archive was uploaded and build 73 was explicitly activated on Test;
channel readback confirms **Test 1.11.6/build 73**, **Live 1.10.3/build 18**.
Mainline is unchanged. No installation or restart was performed.

Archive SHA-256: `99c565726d8fc5c84f428ac83bcccace65b7cea9eed2286e6ace8354a2f5598b`.
Source runtime fingerprint: `f69f7a286e79627a75c0ee701c07704a26a2e3ec9b28caae416239301448620a`.
Archive contents include the isolated trial runtime/profile; the hardware-qualified
three-phase registry remains empty and the single-phase profile is unchanged.

Before/after private readbacks confirm installed Development 1.11.5, app/devkit
session, all 14 EcoFlow device definitions/settings, app settings, 101 Flows and
1,204 Insights identities preserved. Across all Homey devices, two unrelated
integrations changed diagnostic settings during observation; those are separate
from EcoFlow preservation. The existing owner CT1 source was already unavailable
in automatic recovery before upload and remained so afterward. Publication is not
claimed to fix or newly validate that installed runtime; no local operation was
performed to force recovery. Investigate that separately read-only if required.

New pairing defaults to single phase. Three phase requires separate community
consent, current owned model 421/firmware 1.0.0.41 readback and source-overlap review.
It uses signed CT1 phase netting, excludes CT2, rejects incomplete/stale frames and
uses a separate counter binding without migration. Local classification-only
feedback is available through the integration support report, with no automatic
upload. Hardware, independent reference accuracy, native three-phase recovery and
48-hour gates remain open; there is no full-release signoff. No community message
or repeated capture request was sent. See `docs/DUAL_CT_THREE_PHASE_COMMUNITY_TRIAL.md`.


## Opt-in three-phase community Test candidate — 30 October 2026

Owner authorised implementing and publishing a community Test trial because the
remaining physical three-phase validation must come from community installations.
Candidate 1.11.6 adds explicit new-device mode/consent, owned current firmware
readback, separate source-bound trial accounting and local feedback classifications.
Model 421/firmware 1.0.0.41 only; CT1 signed phase sum, CT2 excluded, complete-frame
and five-second packet expiry guards. Qualified three-phase registry remains empty;
community declaration is not hardware verification or a release acceptance pass.

Existing single-phase registry/default resolver/V1 binding and exact-Wh checkpoint
path remain unchanged. No mode migration or existing counter rewrite. Native Add
rechecks source/inventory/mode; trial authority renews with current owned readback.
The existing integration support report gains a bounded classification-only trial
section with no automatic upload. No new controls/public route/battery changes.

See `docs/DUAL_CT_THREE_PHASE_COMMUNITY_TRIAL.md` for scope, feedback and remaining
full-release gates. All 1,261 tests, lint, release checks and pinned Homey CLI 4.5.3 verified
validation pass with locked Node 22 tooling. Full hardware readiness remains
blocked. Publication is pending exact CI/archive verification;
Live/Mainline and installed Development must remain unchanged. No installation,
community message, tester capture request or hardware operation is authorised here.


## Retained three-phase evidence assessed offline — 30 October 2026

Reopened the historical complete snapshot, pruned indexed export and concluding
assignment replies. Privately assessed exact power-field excerpts without
reconstructing missing values or generating wire packets. Complete older CT1
arithmetic is consistent but lacks packet provenance; the later CT1 is incomplete,
while CT2 retains a complete consistent reported packet. Neither supplies current
firmware qualification, reference intervals or eligible-time coverage.

Added an offline expanded-report assessor with classification-only output and
five synthetic regressions. It cannot issue source authority or enable Energy.
All 1,251 tests, project lint, release checks and pinned Homey CLI 4.5.3
verified validation pass; the working single-phase binding/checkpoint regressions
remain green. No runtime driver/profile/binding
change in this follow-up. Planning gates remain eight partial / six open.

See `docs/DUAL_CT_THREE_PHASE_VALIDATION_PROGRESS.md` for completed work and the
ordered current-identity, interval, native-recovery and soak requirements. No
capture request or tester message. Test, Live and installed Development unchanged.
The preceding source-qualification commit's GitHub CI remains queued at review;
local checks are not presented as remote CI completion.


## Three-phase qualification and binding prepared — 30 October 2026

Added an internal trusted-source qualification seam and a separate V2 binding
namespace for explicitly qualified three-phase CT1 signed-net contracts. The new
production registry is empty and release-boundary checks enforce that state.
No driver/settings/pairing path invokes the seam; no hardware gate is promoted.
The future runtime reader/renewal lifecycle remains to be integrated after source
qualification and hardware evidence are reviewed.

The existing single-phase registry, default resolver and binding serialization
remain unchanged. Regression tests pin its pre-change binding and restore a real
production-profile exact-Wh checkpoint through session restart without migration
or downtime backfill. Three-phase tests cover ownership/scope, opaque authority,
expiry/cancellation/late reads, complete CT1 totals, CT2 exclusion and overlap guards.
All 1,246 tests, lint, release checks and pinned Homey CLI 4.5.3 verified
validation pass with locked Node 22 tooling. Full-release hardware readiness
remains blocked as expected. Read-only channel/app checks confirm Test 1.11.5
build 72, Live 1.10.3 build 18 and running Development 1.11.5, unchanged.

See `docs/DUAL_CT_SOURCE_QUALIFICATION.md`. No installation, restart, publication,
Energy/settings/battery/Flow change or tester contact. Test/Live/installed app stay
unchanged; three-phase evidence remains eight partial and six open gates.


## Existing three-phase evidence reconciled — 30 October 2026

Primary historical posts were reopened in fourteen relevant private topics,
with four original native screenshots inspected, alongside indexed history and
repository records. Earlier summaries alone were not used as current proof.
Private raw data/images/measurements/correspondence remain outside Git; the
public evidence review is sanitized. No community message/request was sent.

Existing field evidence establishes a three-phase participant, CT1 property-grid
scope, separate hybrid-inverter CT2, signed native phase summation and historical
W/V/A comparisons. Owner description supports utility-equivalent netting for that
site. The planning ledger now records eight partial and six open gates, with
provisional signed-phase-sum policy. No passed gate, runtime/profile admission,
firmware exception or binding migration results from historical observations.

Still missing: current firmware/qualified source and phase association; complete
time/provenance-qualified CT1 observations; independent reference intervals and
coverage; current three-phase Homey Energy overlap/native recovery/upgrade checks;
and final exact-runtime soak. Native cumulative arithmetic is not interval
accuracy; unknown vendor 773 semantics are optional to the power-derived path.
Current export retention has already improved; historical trimming is not treated
as a fresh defect or grounds for another generic capture request.

See `docs/DUAL_CT_THREE_PHASE_EVIDENCE_REVIEW.md`. No runtime code, installed app,
Test/Live/Mainline, settings, Energy, battery/Flow operations or restarts changed.
Individual mapping crops and all unrelated inbox attachments were not exhaustively
re-read; the detailed private report identifies reviewed sources and limits.


## Three-phase Dual CT source preparation — 30 October 2026

Owner requested investigation/preparation while keeping installed Development,
Test and Live unchanged. Manufacturer specification confirms two three-phase
circuits/six CTs, but current live admission remains single-phase CT1 only.
The existing generic wire/session path already sums three phases in lab tests;
no firmware profile, binding, pairing setting or runtime guard was broadened.

New offline one-payload review compares signed-net and per-phase import/export
hypotheses, always Energy-ineligible. It requires all CT1 powers and a matching
total, rejects partial/duplicate/nonfinite input, never fills missing phases with
zero and excludes CT2. Added regression cases cover opposing phases/zero net and
show that the real profile still rejects nonzero phase 2/3 even when lab netting
can be integrated. Native phase order/sign/netting/timing remain unverified.

See `docs/DUAL_CT_THREE_PHASE_PREPARATION.md` and its all-open planning ledger:
a real three-phase installation/reference is needed, particularly simultaneous
opposing phase flows. Justin's single-phase site cannot qualify those gates.
Historical three-phase community comparisons already exist in the recorded
October exchanges. Reconcile those screenshots/packet reports with the matrix
first; do not assume a new volunteer or another generic capture is necessary.
They are historical candidate evidence, not current-runtime acceptance passes.
No request was sent to any community tester. Proposed quantitative criteria and
candidate selection/binding migration are for review, not hardware acceptance.
No installation, pairing, Energy/settings/Flow/battery action, restart/reconnect,
publication or soak was performed. No three-phase pairing claim/version bump.

Locked Node 22 install, all 1,233 tests, lint, release checks and pinned Homey
CLI 4.5.3 verified validation pass. These are preparation/software checks,
not three-phase hardware acceptance.


## Corrective Test 1.11.5 build 72 published — 30 October 2026

Owner explicitly approved publishing the reviewed corrective Test archive while
preserving Live, Mainline and installed Development. Test **1.11.5 / build 72**
is active, independently verified through the build/channel API after activation.
The published manifest declares the Dual CT cumulative Energy driver. Test build
71 / 1.11.0 was superseded; Live remains **1.10.3 / build 18**. No certification
submission or Live publication ran. Remote Mainline reference is unchanged.

The exact archive already installed locally was uploaded without rebuilding:
SHA-256 `63498f527eed6272207739ae3f3b3fce29908c12e7fe1dc1a1ba043f6e796307`,
runtime `14642252c61416221a632f402ec2a9e5308e50ffa5017bf71dd4d03524e353d3`,
source `e76725844ff0d21145872a4330ce8823f9e0d949`.
[Exact source CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41028099564),
with 1,221 tests and the reviewed local lint/release/pinned validation evidence.
Only the approved corrective changelog was supplied; the store description was
reused unchanged and env is empty. No private household evidence was uploaded.

Before/after readback confirms installed **Development 1.11.5**, origin
`devkit_install`, still running with CT1 available. All 14 EcoFlow definitions,
app-setting hashes, 101 Flows, 1,204 Insights identities and all property Energy
flags match. Two diagnostic fields in unrelated apps refreshed naturally; they
are not EcoFlow definition changes and were not written here. No local install,
restart, pairing/Repair, settings or battery operation, Flow execution, source
reset or forced reconnect was performed for publication.

The supported Test scope remains single-phase CT1 / firmware 1.0.0.41 with
estimated power-derived totals; CT2 and three-phase Energy remain excluded.
Production acceptance, coverage/availability flicker, the original STREAM one-Wh
startup finding, native mobile/accuracy/backup checks and final soak remain
open/partial. Test activation is not a hardware gate pass or a soak start.

Test: https://homey.app/a/uk.co.zarb.ecoflow/test/
Build: https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/72


## 1.11.5 approved Development correction and native recovery — 30 October 2026

Owner approved the reviewed non-clean 1.11.5 archive after exact CI and idle
preflight. Reviewed source matched the canonical snapshot with no drift; the
already-installed 1.11.4 bridge/read-refresh/delta fixes were preserved and
committed with the CT1 correction on the diagnostic branch, source
`e76725844ff0d21145872a4330ce8823f9e0d949`.
[Exact CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41028099564),
with all 1,221 tests, lint, release checks and pinned Homey validation green.
Delivered archive SHA-256:
`63498f527eed6272207739ae3f3b3fce29908c12e7fe1dc1a1ba043f6e796307`.
Runtime fingerprint:
`14642252c61416221a632f402ec2a9e5308e50ffa5017bf71dd4d03524e353d3`.

Fresh preflight found the coordinator outside charging windows with empty intent,
a completed reserve lease and expired legacy lease. No coordinator/gate/fault was
changed to make the preflight pass. One non-clean installation ran; readback
confirmed running Development 1.11.5 and the existing CT1 Energy meter restored
without Repair/re-pair or counter rewrite. Its live power matches Homey's property
Energy report; import resumed increasing and export retained its prior value.

An 82-sample bounded read-only window (08:44:33–08:47:32 UTC) observed a natural
interruption at 08:46:25 and automatic recovery by 08:46:56. The first recovered
sample retained the same totals, then counting resumed: no gap backfill or CT1
counter decrease. One other unavailable sample was 'Updating CT1 readings' during
projection. No forced silence/reconnect or new MQTT observer was used. Receipt
coverage and the availability flicker remain longer-validation concerns, not
utility-accuracy or full freshness signoff. The observer ended; no automation
or final soak was started.

All 14 EcoFlow definitions/identities/settings, 101 Flow definitions, 1,204 Insights
identities, global app settings and all Energy inclusion flags match the baseline.
All ten sampled counters are at/above baseline in the final readback. An original
STREAM charged-energy counter transiently dipped by one Wh at startup, then rose
above baseline on fresh vendor counters. Its pre-install checkpoint was pending;
exact teardown persistence is unobserved. Record this separate startup-continuity
finding; do not describe the entire interval as ten perfectly monotonic counters.
No manual correction, additional installation or battery operation was performed.

Test remains 1.11.0 / build 71 and Live 1.10.3 / build 18; Mainline unchanged.
The corrective Test package/release notes can now be reviewed separately. Native
mobile readback, calibrated accuracy/export/zero, backup recovery, longer coverage
and the exact-runtime 48-hour soak remain open/partial. Hardware gates are not
passed merely by this local restore/recovery observation. Private receipts and
raw snapshots remain outside Git.


## CT1 unavailable recovery investigation — 30 October 2026

Owner's mobile screenshot showed the adopted CT1 Energy meter unavailable with
an incorrect unsupported-meter message. Current read-only Homey check confirms
Development 1.11.4, null power, retained imported/exported counters and a healthy
detailed monitor. Fresh owned-source discovery/current-firmware GET still returns
model 421 / firmware 1.0.0.41; normal contract qualifies, inventory is complete,
and no other active property contributor is present. No Repair or re-pair ran.

Confirmed software defect: native meter_power values have three decimal kWh,
while the restore rollback check compared them with unrounded checkpoint Wh.
An internal 1.6 Wh projects to 0.002 kWh and was wrongly rejected on a local
reporting-gap retry or process restart. Synthetic native-rounding reproduction
fails before the correction and passes after it, for both import and export.
The correction quantises only native projection/restore comparison to one Wh;
precise checkpoint Wh are unchanged. Older checkpoints remain blocked and no
counter is rewritten/reset or downtime backfilled. The generic unsupported
pairing message is replaced with an automatic-recovery message for adopted meters.

The installed checkpoint is not exposed by the existing support API, so the
exact live internal exception remains unobserved. This is a reproduced defect
consistent with the field failure, not a claim that a generic message proves its
cause. Initial installation/import readback was valid but did not prove sustained
recovery. Mobile Energy still needs readback after an approved corrective update.
Today’s historical balance is partial; missing grid hours are not reconstructed.

Correction is local source only. All 1,221 tests, lint and release checks pass.
Preserve the independently deployed 1.11.4 bridge and its uncommitted changes.
Test build 71 / 1.11.0 and Live build 18 / 1.10.3 are unchanged by this investigation.
No app restart/install, battery operation, Flow execution or Energy setting write
was performed. Fresh approval is required for a corrective installation/publication.


## Owner-authorized coordinated reserve execution — Development 1.11.4, 30 October

The HomeyPro chat deployed the reserve-only bridge and coordinated house/office
minute runner on the exact 1.11.0/8db8944 source baseline. Development 1.11.4 is
installed; Test 1.11.0 build 71 / Live 1.10.3 build 18 remain separate. Preserve
this bridge, watchdog, read-refresh API and configuration-delta correction in
subsequent app builds. Do not reinstall 1.10.x or remove the adopted CT1 device.

Owner explicitly authorized interrupting manual house 100% and handing over to
the new schedule. House baseline enabled/18%, office 3%, feed-in OFF; house/CT1
anti-export and native input/output limits unchanged. Office charged at 335 W
under a verified house hold; independent watchdog confirmed office stopped
(fresh -313 W) before house restoration. Automatic 04:43/04:44 UTC decisions
are healthy Outside charging windows. Future tariff-window delivery remains
unobserved. No Codex task resumed; private evidence and historical faults kept.

The read-only header-only ES21 get-all uses the existing MQTT connection and no
new subscription. A new applied battery-power field receipt is required; cloud
cached quota, temperature-only updates and failed writes cannot renew power
freshness. Concurrent reads coalesce; watchdog rechecks unchanged lease identity
after awaiting reads. Preserve manual ownership and independently leased stop.
Native Homey/cloud disconnection still limits physical stopping; this is not a
native one-off task expiry. Full hardware/48h/accuracy qualification remains pending.

Validation: 1,219 tests, lint, release boundary checks and Homey CLI 4.5.3 verified
build passed. Fourteen EcoFlow device IDs/settings/capabilities, all existing
Insights, ten sampled counters and the adopted CT1 Energy settings were retained.
Delivered archive SHA-256:
`d6117a4caad9869cccd7df37d79eb487f1400ea9a60afe1b211cc7fddf72040e`.
Source changes are local and not yet committed/pushed in this deployment phase.
Full private receipts remain in HomeyPro backups/review/house-reserve-control/.

## 1.11.0 Test build 71 published — 30 October 2026

Owner-approved Test build **71 / 1.11.0** is active; portal and API both confirm
Test. Live remains **build 18 / 1.10.3**; no certification submission or Live
publication was performed. Mainline was not changed. Test archive source is
`9a367a8274112777e83fa5459ad3c13980fd9c75`, exact
[CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/40992143771).
Archive SHA-256: `e9c7695a70a54032ee80907e9907781bcee5e010c773356e4de94636e7ffc8db`.
It differs from the approved Development archive only in documentation/listing
metadata: runtime fingerprint remains
`6fe3db750e6492e21a7028e3666df1105e2a39e0c58b128a5a59a90b52e44b94`.

Local Development 1.11.0 and the one CT1 property Energy meter remain running.
Final read-only Energy report includes the new device and its cumulative property
power matches the meter; import estimate continued to 0.037 kWh. All original
13 EcoFlow definitions, 101 Flows, 1,201 Insights identities and eight cumulative
counters remain preserved/nondecreasing. Added device/logs are intentional; later
reserve-gate changes belong to concurrent commissioning and were not overwritten.
The existing detailed monitor's persistent warning is cleared.

Test supports single-phase CT1 / model 421 / firmware 1.0.0.41 only. Pair one
separate property Energy device and review overlapping property meters; the
existing detailed monitor is not automatically converted. Totals are estimates
from observed power, not migrated vendor counters. CT2 and three-phase Energy
remain excluded. Local import/adoption observations do not close calibrated
accuracy, export/zero, native persistence/recovery/mobile or 48-hour-soak gates.
No battery settings/tasks/commands or Flow execution were performed by this task.
No final soak automation is running.

Test link: https://homey.app/a/uk.co.zarb.ecoflow/test/


## 1.11.0 approved Development and CT1 Energy adoption — 30 October 2026

Owner approved the non-clean combined candidate and one CT1 property Energy
adoption, then explicitly authorised a new Test build. Source runtime aa4ee07,
fingerprint 6fe3db750e6492e21a7028e3666df1105e2a39e0c58b128a5a59a90b52e44b94,
passed exact CI and all 1,206 tests. The preflight found independently installed
1.10.64: its compiled app/API/reserve bridge/configuration decoder match the
combined candidate. Its execution Flow was disabled and a faulted lease prevented
watchdog actions. No fault, gate, lease, battery setting or Flow was changed here.

Non-clean 1.11.0 delivery and immediate readback passed: all 13 existing EcoFlow
identities, definitions/settings, 101 Flows, app-setting hashes, all property Energy
flags, 1,201 Insights IDs and eight nondecreasing counters were preserved.
One separate owned CT1 Energy device was then added through real pairing,
firmware readback and explicit overlap consent. It is cumulative and included;
all pre-existing Energy flags and devices remain unchanged. The detailed monitor
warning is cleared. The new meter is available; Homey's live Energy report includes
it and totalCumulative.W matches its power. Estimated import increased from
0.003 to 0.016 kWh; export remained zero. Three new Insights logs were added,
with every prior Insights ID retained. These are adoption/import observations,
not calibrated accuracy, physical export/zero, recovery or soak acceptance.

The independent reserve task continues commissioning. A later readback found its
houseReserveControl setting changed after the initially equal preservation check;
this task did not write that setting or restore its old value. Preserve concurrent
work and coordinate again before any future installation. No further battery
operation, Flow execution, forced reconnect or app restart was performed here.

The Test listing/changelog is being aligned with the supported single-phase CT1 /
firmware 1.0.0.41 scope. Its runtime fingerprint is unchanged from local 1.11.0;
metadata-only packaging does not require another local installation. Test publication
must be verified separately in the portal. Live and Mainline remain unchanged.
Full production and final 48-hour soak remain gated by the native acceptance ledger.
Raw captures, settings, pairing receipts and household readings remain private.


## 1.11.0 combined CT1 Energy review candidate — 30 October 2026

Normal CT1 Energy candidate admission is prepared for model 421 / firmware
1.0.0.41 / single-phase CT1 only, using guarded receipt-time estimates, a 5 s
logical power TTL and explicit new-device adoption. Unknown firmware, absent
phase values, nonzero phases 2/3, retained/duplicate/old sequence/late deliveries
cannot qualify. The existing monitor retains identity/capabilities and gains no
Energy. No device is paired automatically. See
[the candidate qualification and limits](CT1_ENERGY_CANDIDATE_VALIDATION.md).

Confirmed accounting fix: unrelated CT2/voltage packets no longer erase CT1's
power anchor or renew freshness. Partial CT1 still clears the anchor. The bounded
01:20–01:35 UTC passive stream revealed a roughly 14 s gap and out-of-order burst;
no MQTT/hardware command was sent. Offline replay uses the real candidate resolver
and private lab storage only. Import estimates are corroborated, not calibrated;
physical export/zero, native Energy adoption/recovery and final soak remain open.
No hardware ledger gate is marked passed. Source admission does not replace full
release acceptance; hardware-required commands must still return nonzero.

Another active owner task installed Development 1.10.63 during this investigation,
adding reserve control in a separate checkout. This task did not install it or
change battery settings. The combined review snapshot preserves that bridge and
newer source edits. Coordinate a fresh idle/lease checkpoint and verify latest
bridge provenance before any later approved installation. Do not overwrite it
with a meter-only archive or silently pause its coordinator.

This is local source preparation, not an installation, activation, Test or Live
publication. Keep raw captures/identities/settings and private review evidence out
of Git. Preserve older ES21/ES22 evidence with its original runtime; no transfer
to this candidate. Readiness, exact CI, delivery and physical acceptance stay separate.

## Dual CT firmware lookup found and validated read-only — 30 October 2026

The native app's GET /iot-service/device/latestPackInfo, with native lang/version
headers, returns same-source model-421 cpackInfo.version=1.0.0.41. Current-package
metadata is distinct from latestPackInfo (an offered update). Two new guarded GETs
and the default DualCtHomeyEnergyContext lookup succeeded with real owned discovery
and complete inventory; no injected firmware or Energy session. See
[firmware readback review](DUAL_CT_FIRMWARE_READBACK.md).

Local source now includes a strict current-package reader and wires normal context
discovery to it. Wrong identity/model, offline, malformed, offered-only, upgrading,
loader and unknown status fail closed. Native version-report PUT and upgrade writes
were explicitly excluded. This resolves the missing-reader engineering dependency;
old assertions below that no firmware reader exists are superseded.

The cloud metadata has no device-report timestamp: hardwareReportedAt stays null.
API receipt time cannot prove live hardware or CT1 measurement freshness. No
firmware-change/recovery, sign/timing or accounting gate is passed by this finding.
Resolver remains empty, Energy runtime hidden/off. Finish measurement qualification,
then review a concrete installation/adoption candidate before any native write.

Final readback retains 13 EcoFlow definitions/settings, Energy configuration,
1201 Insights and eight nondecreasing counters. Existing 99 Flow definitions are
unchanged, with one additional Advanced Flow now present (100 total); its author
is not established, and it was not modified or executed here.

All 1185 tests, locked Node 22 install, lint/release/diff checks and pinned Homey
4.5.3 verified validation pass. Prior local UI cleanup/docs are preserved. Installed
Development 1.10.62, Mainline/Test/Live and all Energy settings remain untouched;
no install, restart/reconnect, hardware command, pairing, battery/Flow operation,
version bump, push/publication, new CI or soak. Raw evidence stays private.

## Dual CT completion review and UI cleanup — 30 October 2026

Owner prioritized normal CT1 property Energy with preview/banner cleanup; any
installation or Energy change remains subject to review. Current source clears
the persistent research warning and uses normal EN/DE/NL product/monitoring wording.
Existing IDs, consent, custom names, expiry and Energy/Flow/Insights boundaries
are retained; no automatic paired-device rename or Energy conversion.

Fresh native firmware remains V1.0.0.41. Owned app discovery exposes model 421 but
no firmware; Developer quota GET returns 1006. Runtime source qualification is
therefore still blocked. A bounded read-only 25-pair comparison with an owner-
confirmed property meter supports import corroboration only; do not mark physical
accuracy/export/zero/timing or final-candidate gates passed. See
[the concrete completion review](DUAL_CT_COMPLETION_REVIEW.md) for the finite route.

Fresh readback: 13 EcoFlow IDs, 99 Flows, 1201 Insights, eight nondecreasing counters,
no new broken Flow. Energy/settings are unchanged during this review. Office meter
exclusion and CT1 grid-description changes predate the first readback this turn;
compared with the prior restart baseline these are differences, not a clean equal
preservation claim. Do not restore them or attribute them to this agent.

All 1178 tests, locked Node 22 install, lint/release/diff checks and pinned Homey
4.5.3 verified validation pass. Cleanup remains local/uninstalled, no version bump,
commit/push/new CI. Installed Development 1.10.62 unchanged; Test/Live/Mainline
unchanged. Energy driver hidden/off, resolver empty, no soak started. No hardware
command, restart/reconnect, installation, pairing, battery setting or Energy write.

## 1.10.62 approved idle restart passed — 30 October 2026

Owner's single graceful restart ran **00:31:39.146–00:31:40.788 UTC** after two
passing idle/checkpoint preflights. Running observed by **00:31:42**, fresh 0 W/idle
by **00:31:44**, and real 0% SOC in both roles by **00:33:29**. Initial readings
were unknown; zero SOC was not inferred. Precise pre-restart charged/discharged
totals and projected meters remain exactly unchanged throughout observed startup.
One restart only; no battery/task/settings write, install or forced reconnect.

Fresh native idle comparison **00:36:19** agrees. Final **00:36:32** full readback
preserves 13 EcoFlow identities/settings/capabilities, 99 complete Flows, 1201
Insights IDs, app-setting hashes, all 276 Energy configurations and eight comparable
nondecreasing counters. No new broken Flow/definition change. Original reporter
matched/original_stream; independent native GET/main/SOC matches and power differs
under 0.003 W. Self-powered, no tasks, clean checkpoint and zero new-session
reconnects. Observer stopped; raw evidence private outside Git.

ES21 idle is refreshed to runtime 31c31c48…1545; current charge/discharge passes
remain. Full freshness/recovery and Energy continuity remain partial: nonzero
outage, precise expiry/hint horizon and absolute energy accuracy were not proved
by an idle restart. Older identity/ES22 passes are not transferred. See monitoring
RC owner-development-11062-idle-restart. Test/Live/Mainline and runtime unchanged.
No 48-hour soak or automation started; review the separate start/scope next.


## 1.10.62 startup investigation/recovery proposal — 30 October 2026

No confirmed runtime defect found for the 575 W startup snapshot. Both decoded
paths reported it; source scaling, role separation and accounting checks pass.
Missing original MQTT bytes/simultaneous native peak leave the physical cause
unresolved. No clamp, runtime patch or repeat charging task is recommended.
See [the investigation and recovery review](STREAM_5000_11062_STARTUP_RECOVERY_REVIEW.md).

Existing natural-gap evidence is partial: ignoredGaps=1, no reconnect/reset,
discharged counter flat 77 Wh at 00:06:55–00:10:45 then increasing. Insights power
is carried/interpolated and cannot prove tile expiry. A six-minute cached-read
observation ended at 00:23:16: 343 fresh-zero/live samples, age at most 3 seconds,
no expiry event. Fresh 00:24:36 readback preserves 13 devices/99 Flows/1201 Insights,
all Energy configuration/settings and counters. Observer stopped normally.

Recovery proposal is **one graceful app restart after fresh idle/checkpoint
preflight**, followed by startup/counter/preservation checks, with no battery
setting changes. No restart, task, install, re-pair, forced silence/reconnect,
new capture flag, Flow execution, control/Energy activation, publication or soak
ran. Test/Live/Mainline and fingerprint 31c31c48…1545 unchanged. Freshness/recovery
and Energy continuity remain partial; no new gate passes. Owner review precedes
any restart or battery change and the later qualifying soak start.

All 1177 tests, lint, release/diff checks and private synthetic examples pass;
no runtime change. Review records remain local and private evidence stays outside Git.


## 1.10.62 attended charge/discharge completed — 29–30 October 2026

Owner amended the approved 500 W test to start immediately and finish midnight,
then saved/started the native one-off task. Persisted Never/date/time/power were
verified. Observed charge **23:33:37–00:00:08 UTC**, approximately 26.5 minutes,
SOC **0→4%**, about **219.4 Wh** internally integrated. Steady **493–502 W** agrees
with near-time native comparisons; retain one unresolved **575 W startup** sample.
No power-limit, calibrated energy, capacity or efficiency signoff is implied.

Discharge appeared **00:00:13 UTC** before deletion confirmation **00:00:22**;
task list empty by **00:00:28**, Self-powered restored **00:01:03**. Native discharge
690 W / 4% agrees with Homey -671 W / discharging / 4% about two seconds later.
Fresh **00:03:37 UTC** readback passes preservation versus the actual pre-test
baseline: 13 devices, 99 complete Flows, 1201 Insights identities, app-setting
hashes, all Energy configuration and eight nondecreasing comparable counters.
No unexpected changes/newly broken Flows; zero reconnects. Collector stopped.

Only ES21 charge/discharge reporting gates are refreshed to fingerprint
31c31c48…1545; see the new monitoring RC section and ledger. Historical identity/
idle fingerprints, system/energy-accuracy, startup transient, freshness/recovery,
rollback, temperature, ES22/accessories, Dual CT Energy and final-candidate soak
remain separate/open. No 48-hour soak, publish, install, re-pair, extra restart,
forced reconnect/silence, Flow execution, new controls or Energy migration.
Test/Live/Mainline unchanged. Raw household evidence remains private outside Git.

All 1177 tests, lint, release-boundary/ledger checks and diff check pass. Runtime
fingerprint remains unchanged. Documentation/ledger updates remain local for review.


## 1.10.62 preflight and approved editor inspection — 29 October 2026

Read-only preflight confirmed running 1.10.62 and preservation against the prior
post-install baseline: 13 EcoFlow identities/settings, 99 complete Flows, 1201
Insights identities, global app-setting hashes and all Energy configuration match;
no sampled counter decrease or newly broken Flow. Native House battery and
Homey agree on fresh 0%/0 W/standby. Firmware remains V1.1.6.18. This is idle
comparison, not nonzero Energy, physical capacity or final hardware signoff.

Owner then explicitly approved a temporary Custom-mode editor inspection and
restoration only. Current editor confirms half-hour timing and a Never/date
option, but defaults to 2500 W/Daily. The task-power slider did not accept tool
input; no 500 W selection or saved charge is claimed. The unsaved card was removed,
all edits discarded through Don't save, and Self-powered restored. Fresh
23:25:38 UTC readback confirms empty tasks, original configuration, zero power
and unchanged zero charged/discharged counters; preservation still matches.

The private dated charge/stop proposal remains outside Git for owner review.
No charging test, saved task, additional restart/reconnect, Energy migration,
re-pair, Flow execution, acceptance promotion, soak or publication. Test/Live/
Mainline unchanged. Executing a charge still needs explicit approval, owner
attendance/local stop and verified 500 W, one-off date/time and removal route.
A 10-minute manual stop inside a 30-minute task window is not a hard cutoff.


## 1.10.62 charge/recovery/48-hour plan prepared — 29 October 2026

Owner requested a plan with battery setting changes reviewed before execution.
See [the review plan](STREAM_5000_11062_VALIDATION_PLAN.md). It covers an attended
500 W charge, conditional native-editor cutoff, natural discharge, independent
energy-reference requirements, natural recovery, separately approved restart
and a 48-hour soak after restoration. The historical half-hour task-editor limit
is explicit: a ten-minute manual stop is not a ten-minute hardware cutoff.

Planning only: no task/setting, restart, reconnect, pairing, Energy/source or
Flow operation; no soak/monitor started, acceptance gate promoted or Test/Live/
Mainline publication. Installed 1.10.62 attribution and prior hardware limits
below remain unchanged. Fresh execution baseline and exact dated native task/
stop parameters must be reviewed before any battery write. A later runtime or
Energy change requires final-candidate requalification; ES21 cannot qualify ES22
or Dual CT by itself.

Plan validation: locked dependencies on Node 22, all 1177 tests, lint,
release-boundary/ledger checks and diff check pass. Runtime fingerprint unchanged;
hardware readiness remains pending. Documentation remains local for owner review.


## Current installed/source runtime — Development 1.10.62

Owner approved the exact archive, non-clean, plus preservation/read-only validation.
Delivery **29 October 23:01:53.660 UTC**, SDK/UI confirm running/enabled 1.10.62.
Implementation b31eacb / exact CI 40969235537 passed before delivery. Runtime
fingerprint (archive provenance, not installed-file rehash):
`31c31c481516fa3c7ff4acd8ae75cd2bc9bf3f6121c7015b51ddee7c1ecd1545`.
Archive SHA256 `ac83f47fbdd8093965a4c43699c07a774c7d16804062f8eb7e51813a1cf2e99f`.
All 13 identities/settings/capability metadata, 99 complete Flows, 1201 Insights IDs,
app-setting hashes and all 276 device Energy configurations preserved. Eight
sampled counters nondecreasing; no unexpected changes/newly broken Flows.

Original aggregate main resolution is matched/original_stream, with a fresh
read-only EcoFlow comparison agreeing on SOC and power to under 0.01 W. No battery
write was used. The 5000 reports fresh zero power/idle; SOC waits for its own
receipt, then reaches real 0%. Five samples over two minutes keep both new
counters at zero with accepted power samples. Source/telemetry/short idle checks
pass within scope; native sign/energy accuracy, capacity, recovery/rollback,
Dual CT qualification and final-candidate soak remain open. No hardware gate is
promoted merely from software tests or this short zero window.

Test/Live/Mainline, grid/CT1 and battery settings/tasks, Flows and pairing unchanged.
No extra restart, forced reconnect/silence, Energy activation or Repair. Existing
pairing gate remains as approved previously. See newest STATUS and monitoring RC
owner development 11062 readback for evidence and exact limits. The candidate
preparation and earlier deployment records below are historical.


## Previous candidate preparation and installed 1.10.61 reconciliation

29 October: the original aggregate relinking fix a1391f0 was separately approved
and installed by the coordinating HomeyPro task at 22:37:59.909 UTC. Its reviewed
archive hash f09d1655…fea2e3a was rechecked; installed source fingerprint is
`82f0120b20fcea1033117aee3f81b51308a4631b731e615ef32610634b1521e6`.
This supersedes the earlier 224ad5f/0b32aa19 archive despite the same 1.10.61 version.
Preserve the concurrent deployment record below; do not install that fix again
merely because an earlier handover called it source-only. Test/Live unchanged.

Fresh read-only evidence at 22:41 shows the 5000 aggregate now receiving **0% SOC,
0 W and idle**, with accepted power samples and unchanged zero counters. This
followed the separately approved restart, so recovery must not be described as
spontaneous or as proof of native-app triggering. Owner is unsure about opening
the native overview. Singleton-record SOC and derived battery flow remain distinct
from independently verified installation scope. See
ORIGINAL_RELINKING_AND_5000_STARTUP_REVIEW.md for the evidence and limits.

Prepared source **1.10.62**, NOT installed, carries the relinking correction and
a confirmed SOC scope guard: peer discovery explicitly clears a prior singleton
SOC fallback, while explicit system SOC (including zero) remains authoritative.
Two added tests cover that transition and late-listener zero recovery without
inventing readings or energy. **1177 tests**, locked Node 22 tooling, lint,
release/diff/audit and pinned Homey verified validation pass. Candidate fingerprint:
`31c31c481516fa3c7ff4acd8ae75cd2bc9bf3f6121c7015b51ddee7c1ecd1545`; archive SHA256 `ac83f47fbdd8093965a4c43699c07a774c7d16804062f8eb7e51813a1cf2e99f`.
No install, reconnect, Homey setting/Flow/device action or publication ran in this
investigation. Current installation is a1391f0, not this candidate. Hardware gates
are unchanged; review a new exact archive before any further Development update.


## Reviewed aggregate fix deployed — 29 October 2026, 22:38 UTC

Owner approved non-clean Development deployment of source a1391f0. Built from an
isolated Git export with locked dependencies and pinned CLI 4.5.3 verified-level
validation; source CI 40966605948 passed. Archive SHA256:
`f09d165586e6e8f93d579cd019ee3e252dec21f175add9128625dbc49fea2e3a`.
Homey accepted clean=false/debug=false; running Development remains version
1.10.61, now with this aggregate fix. Runtime attribution is exact archive/upload
provenance plus corrected readback, not an installed-filesystem rehash.

Read-only verification at 22:39:41: current original main is Ultra X Left; a fresh EcoFlow Developer API read
and Homey agree at 38% and approximately -162 W (reported discharging). Runtime
reporter resolution is matched/original_stream. Paired device data and saved old
main identity stay preserved; the false saved-address comparison is expected.
Control target verified from deployed code, runtime resolution and native GETs;
no battery write, outlet command, forced mode/limit, native relink or extra restart.

All 13 EcoFlow IDs/data/settings/capability metadata and semantic icon IDs, all
99 complete Flows, all 1201 Insights log IDs and global app settings preserved.
Eight sampled cumulative readings across six devices did not decrease. House
5000 physical/aggregate and Dual CT settings preserved; native-reported limits,
reserve and mode returned to the same values after startup unknowns. Signed icon
transport URLs changed on reinstall; this is not an Insights/capability migration.
Private before/after/archive/target evidence is retained in the coordinating
HomeyPro chat's ignored .private-transfer/ecoflow-aggregate-a1391f0 directory.
Original private transfer and watcher cursor hash remain exact. Codex tasks were
not resumed. No store/Test/Live publication or Energy/source/pairing change.
This is aggregate reporting and preservation verification, not physical
office-to-house delivery, anti-export enforcement or a new 5000 hardware gate.

## Historical alignment before the separate 22:38 installation

29 October reconciliation: a separate source-only correction a1391f0 was added at
22:32 UTC after the approved archive was prepared and installed. It fixes the
original aggregate's post-relinking reporter binding; exact CI 40966605948 passes.
Current source runtime fingerprint is
`82f0120b20fcea1033117aee3f81b51308a4631b731e615ef32610634b1521e6`.
This newer work was preserved and is NOT installed. Version metadata still reads
1.10.61, so do not infer package identity from the version alone.

The installed Development 1.10.61 is the approved 224ad5f archive delivered at
22:20:18 UTC, fingerprint
`0b32aa19c02e36b14249c070009547ca039e114bfdfeae89ff1959181d31f02b`.
It includes the physical-unit main-role and Smart Meter floor fixes, but not
that later original-aggregate correction. No re-add is recommended: retain both
Home Battery identities/Flows/history, review a separately versioned candidate
for the original reporter binding, and investigate missing initial battery data
for the new 5000 aggregate. No further install or publication is authorised by
this alignment record. Mainline/Test/Live remain unchanged.


## Aggregate relinking correction — 29 October 2026, SOURCE ONLY / NOT INSTALLED

Owner requested a source-only fix after read-only evidence showed an original
aggregate still reading its paired former main while fresh system-main resolution
selected another original unit. The candidate keeps the Homey data identity,
capability/Insights identities, custom titles, Flows and accumulated totals intact.
It resolves an original-family main before the first poll/MQTT subscription and
uses that address for aggregate telemetry, history and control readback/writes.
Controls revalidate the main before reads and before each command. Lookup failure,
unsupported families and an in-session main change block controls and clear live
system readings; no old-address or 5000 fallback. Reinitialization is required to
bind again after such a block. No automatic cross-generation merging or migration.

Reporter changes retain accumulated charged/discharged energy, invalidate the old
raw baselines, and re-anchor to the new reporter without importing lifetime totals
or integrating downtime. Raw-baseline nulls and their source identity persist so
restart before the first new counter sample remains safe. Existing counters are
not rewritten to correct past reporting. A small default-no-op base startup hook
binds the source before REST/MQTT starts; other drivers retain existing behaviour.
Daily history starts only after a successful original binding. Late lookup results
cannot overwrite a newer initialized session. Diagnostic checks remain read-only.

Validation: locked npm ci; 1175 tests pass (seven new relinking/source/command/restart
regressions); lint passes; release:check passes with hardware gates still pending;
npm audit reports zero vulnerabilities; pinned Homey CLI 4.5.3 verified-level local
validation passes. No installation, restart, pairing, Homey setting/Flow/device
command or store publication. Codex tasks remain paused. This is
source on the diagnostic branch and was not deployed by that source-only work.
The separate approved 224ad5f installation is recorded above; a1391f0 remains uninstalled.
Physical acceptance and controlled power-flow tests remain separate approval gates.


Updated 29 October 2026. This is the portable starting point for the active
EcoFlow STREAM integration work. It does not grant permission to deploy or send
commands. See STATUS for the dated evidence behind each statement.

## Installed Development 1.10.61 — approved 224ad5f archive

Owner approved the corrective archive and resuming one ES21 aggregate pairing.
Delivery completed 29 October 22:20:18 UTC, clean=false/debug=false; SDK/UI confirm
running/enabled Development 1.10.61. Source 224ad5f, exact CI 40964207952 green;
archive-provenance runtime fingerprint
`0b32aa19c02e36b14249c070009547ca039e114bfdfeae89ff1959181d31f02b`.
1168 tests and documented software checks passed before deployment. Corrected
original main role now matches the private API identity. All 12 existing device
IDs, 99 full Flows and six counters preserved through this update; the expected
role/nine-tile correction was reviewed. Historical 1.10.60 1 Wh drop is not erased.

Exactly one approved Home Battery 5000 is now paired, same full serial as the
house ES21, enabled for Homey Energy; total EcoFlow devices 13. Pairing preserves
all original definitions/settings/metadata/Flows/counters; the sole global setting
change is the approved gate. Physical monitor has no second Energy contribution;
original reporter trial stays off. No grid-meter source or battery command changed.

New aggregate receives fresh grid/temperature/health but has not received battery
SOC/flow/state in the three-minute observation. Zero counters with zero accepted
power samples are waiting for data, NOT an idle/accounting pass. Desktop pairing
and device-panel UI render. Owner confirms the new battery is visible in mobile Energy → Batteries. Fresh
native comparison and mobile reading accuracy remain pending; native computer
access timed out. Do not infer zero/standby from
empty SOC. Natural physical numeric expiry is observed while temperature remains
fresh, but five-second latency/hint horizon/recovery are not accepted. See newest
STATUS and monitoring RC owner development 11061 pairing readback. Mainline/Test/
Live, Dual CT Energy, hardware tasks/controls, native linking and Flows unchanged.
All aggregate accuracy/recovery/final-candidate soak gates stay open. Checkbox
removal and ordinary pairing are not complete.

## Previous installation — Development 1.10.60; pairing paused

Owner-approved delivery completed 29 October 22:00:49 UTC; SDK/UI confirm
running/enabled, archive-provenance fingerprint a4e8e24c…028a42fc. All 12 identities,
99 complete Flows and app-setting hashes remain, but preservation is NOT fully
passed: one original unit's role/capabilities changed, and the office meter's
imported total decreased about 1 Wh. Owner reports recent relinking; fresh API
lookup names another original BK61 as main, consistent with the role change.
Do not restore old roles/controls automatically. See newest STATUS and monitoring
RC for exact delivery, differences and evidence limits. No 5000 aggregate was
added, Energy pairing gate remains off, and Mainline/Test/Live are unchanged.
Further installation/pairing must use a newly reviewed candidate and approval;
no automatic retry or rollback. All aggregate/hardware/soak gates remain open.

## Previous source preparation — diagnostic 1.10.60

Home Battery 5000 Energy qualification now has nine additional regressions and
confirmed fixes for rejected/unapplied power accounting, expired/missing gaps,
projected counter restoration and retry at zero power. EN/DE/NL copy distinguishes
monitoring from Energy contribution and battery settings managed in EcoFlow.
1165 tests and documented software checks pass. Runtime fingerprint:
`a4e8e24c39d77037971706359e8848680e4fed92a3aa01e4c985ba6e028a42fc`.
See HOME_BATTERY_5000_ENERGY_VALIDATION.md for the exact archive and bounded next
native step. Installed app remains Development 1.10.59; checkbox and channels
are unchanged. No native gates transfer to this candidate. Owner confirms no
direct PV on the ES21; that limits this test scope, not general PV support.

## Previous installation — diagnostic 1.10.59

New separate Dual CT CT1 Energy driver is wired through owned discovery, Homey
contributor inventory, review/confirmation, persistent session and shared MQTT
subscription. It is hidden from Add Device (`deprecated: true`) and runtime-off;
production contract registry remains empty and firmware readback unavailable.
Do not equate implemented driver plumbing with qualified or activated Energy.
The existing preview and other Energy roles are unchanged.

Existing app-connected roles now offer source-preserving account Repair. It checks
ownership of all existing consumers and protected account bindings, requires fresh
confirmation, reads back the shared credential write and resumes only prior
monitoring consent. Partial writes attempt private rollback; no new Energy/control
permission or device identity is created. Native Repair acceptance remains open.
Late/cancelled/superseded sign-ins cannot overwrite the selected pending account.

1156 tests, locked Node 22 dependencies, lint/release/diff/audit and pinned Homey
verified checks pass. New source fingerprint `e0216df13cb1fc67ab11f1ccdef7ac94dc7b9e10b258bf4b3dc1ad7706bc2d7b`.
Owner approved the exact non-clean archive update, completed 29 October at
21:19:16 UTC. Independent SDK/UI readback confirms Development 1.10.59 running.
All 12 identities, 99 full Flows, settings/fixed Energy configuration and six
checked cumulative counters were preserved. Later original Smart Meter note and
zone changes were owner edits, explicitly confirmed and retained; zero unexpected
differences remain. Settings and blank Repair entry render; no Repair was submitted.
Seven passive samples over three minutes show fresh traffic, not expiry or soak
acceptance. Fingerprint attribution is verified archive delivery provenance,
not an independent installed-filesystem hash. See newest STATUS and RC for the
archive SHA256, exact CI, observation limits and private preservation record.
Mainline/Test/Live and Energy permissions stay unchanged; no store publication.
Limited Test publication needs separate review/approval; full Energy gates remain
open. Implementation c745ee63a536abe303bf6d2718e88c4f6ca46e05 and pre-install
documentation tip 9e6afb3f3f6ffc2cd4e1ee19f55663f3cd92b233 had green exact CI.

## Previous source checkpoint — production settings and complete Energy scope

29 October: diagnostic source settings cleanup separates connections, Energy setup
and collapsed optional Support. New guidance is localised EN/DE/NL; obsolete Beta
copy removed while real preview/validation limitations and consent stay explicit.
Raw settings exceptions are no longer displayed; existing IDs/behaviour preserved.
See ENERGY_RELEASE_COMPLETION.md for the source/SDK role audit, fresh read-only
owner Energy inclusion and remaining engineering dependencies. Dual CT is still
unwired/default off; normal discovery does not provide a demonstrated firmware
readback. Dedicated 5000 solar Energy scope and account re-authentication also
need explicit completion decisions. Do not claim every Energy integration or
sprints 4–6 complete. New source is not the installed runtime; installation and
all channels remain unchanged. Hardware results below retain their exact older
fingerprints. See newest STATUS for source verification outcome.

## Previous owner installation — Development 1.10.58

Latest read-only native comparison on 29 October accepts ES21 identity and the
single-unit idle operating point for this exact runtime. Full serial matched
privately; current native system has that unit plus Dual CT and offers original
units separately for linking. Native firmware is V1.1.6.18; nominal 5 kWh/1x is
not usable-capacity evidence. Temperature sensor/display difference stays open.
See STATUS/RC owner-native-idle-comparison; no charge/discharge/recovery/soak,
linked-pack or aggregate Energy gate is inherited from this point.

Owner completed CLI consent and separately approved the reviewed non-clean
diagnostic update. Source `85c5cad`, exact CI `40913604866` green, delivered
29 October 16:50:07 UTC; running 1.10.58 independently read back. Runtime fingerprint
`da1da009bfe7ee65d02b0c67bc5ccb238ee6242bb397347331722219a75baee1`.
All 12 current EcoFlow device definitions/settings/capability metadata, all 99
complete Flow definitions and global app-setting hashes match private baseline;
six cumulative sequences are nondecreasing. No store publication or Energy/control
activation. Native comparison/sparse expiry/charge/discharge/accessories/rollback/
soak remain open. See newest STATUS and RC owner-diagnostic-installation checkpoint.
CLI is authenticated now; earlier failed login and not-installed notes are history.

## Latest candidate preparation — diagnostic 1.10.58, historical pre-install notes

Sprint 4 adds an unwired, source-bound adoption review/confirmation workflow;
Sprint 5/6 readiness combines the separate meter and all battery model/role gates.
1126 tests, locked-dependency Node 22 checks, lint/release/diff/audit and pinned
Homey verified validation pass. Runtime fingerprint:
`da1da009bfe7ee65d02b0c67bc5ccb238ee6242bb397347331722219a75baee1`.
See the newest STATUS checkpoint and SPRINT_4_6_ACCEPTANCE_PLAN.md. Actual Energy
driver/UI/subscription integration and firmware/timing qualification remain open;
resolver/runtime are still closed. Installed host is still Development 1.10.56,
linked physical battery scope is unverified, Dual CT showed another stale interval,
and native computer-control timed out. CLI is unauthenticated. No new hardware
pass, deployment or publication. Do not equate requested sprint work with specific
approval to install, operate hardware or change Energy sources.

## Current continuation — Dual CT property Energy release work

Owner confirms Dual CT installed/paired, CT1 at the single-phase property incomer
including the office/shed submeter, CT2 disconnected. Original batteries are in
the office; the electrically connected microinverter has its own reported EcoFlow
space. The target is Dual CT CT1 as the future authoritative property Energy
meter, not an interim switch to another source. See DUAL_CT_RELEASE_SPRINTS.md,
DUAL_CT_ENERGY_RC.md and the new exact-candidate acceptance ledger.

Fresh 29 October portal: Test 1.10.56 / Build 70, Live 1.10.3; installed enabled
Development 1.10.56 (package not rehashed). Source e469c37 / 1.10.57 is pushed,
exact CI 40781605070 passed. The earlier local-only paragraphs below are history.
The new diagnostics/acceptance/device-adapter sprint is checkpointed on the diagnostic branch and unwired/default
off for Energy. No install/publish, source transition or hardware operation.
Native Dual CT firmware V1.0.0.41 and approximate import-point agreement are
partial older-runtime observations, not qualification of the new source.

## Current release preparation — 1.10.57

The owner authorized committing/pushing the consolidated diagnostic changes and
publishing one new Test build. Version 1.10.57 is prepared; fingerprint
`f790f04fd12985cf0cdf28dce191397195388eea2f7c7b446acb179309a64ec5`.
Fresh locked-dependency validation passes 1101 tests, lint/release/audit/verified
checks. Follow the newest STATUS checkpoint for CI and actual channel outcome;
preparation is not publication. Mainline/Live and owner Development f1234365…9ba2
must remain unchanged. The local-only entries below describe earlier preparation.

## Latest local source — field-aware original STREAM reconciliation

The newest STATUS checkpoint records a local fix for REST starvation by unrelated
MQTT packets on the original STREAM aggregate. Conflicting raw fields/aliases and
derived power/counter/PV/mode groups are withheld; unrelated REST fields recover.
Five new regressions plus the existing suite pass (**1101 tests**, lint/release/
verified validation). Latest local fingerprint:
`8dc2d532deca2dc995b664f7745d757668983659791b46e4bed365632be53d9a`.
The widget changes below remain included. None of this local work is committed,
pushed, installed or published. Installed f1234365…9ba2 and historical hardware
acceptance remain separate. Stefan's exact freeze has not been hardware-reproduced.

## Local follow-up in the new checkout — 28 October 2026

Uncommitted diagnostic work now follows the synced `63b229c` checkpoint. The
original STREAM freeze/capacity investigation fixed locally reproduced widget
refresh stalls (unsettled bridge response and page restoration), with ten page-
script regressions. Capacity setting hints now explicitly distinguish widget
estimates from Homey Energy capacity; a selected-installation regression guards
against inferred unit-count/other-space capacity. The reporter's built-in Sensors
freeze and Energy screen concern remain unreproduced pending version/screen
clarification. Do not announce those symptoms fixed from widget tests.

All 1096 tests, lint, release checks, diff checks and pinned verified Homey
validation pass. Local source fingerprint is
`5ca108a2fd945dfbe83ed37c14da9a3deffe7584a5da1dcdf0bea681d65812c9`.
This candidate is NOT installed, pushed or published. The owner installation and
its `f1234365…9ba2` evidence below remain unchanged; no hardware acceptance is
transferred to the new fingerprint. See the newest STATUS checkpoint for details.

## 1. Clone the right branch

Repository: https://github.com/zarbjustin/uk.co.zarb.ecoflow (public).

Active branch: `codex/mixed-generation-reporting-diagnostics`.
The default branch is `master`, which does **not** contain this diagnostic wave.
Do not merge it or change the repository default branch during migration.

```sh
git clone --branch codex/mixed-generation-reporting-diagnostics https://github.com/zarbjustin/uk.co.zarb.ecoflow.git ecoflow-stream
cd ecoflow-stream
git fetch origin
git status --short
git rev-parse HEAD origin/codex/mixed-generation-reporting-diagnostics
```

Use a normal local, non-cloud-synchronised development folder. The old checkout
was a linked worktree whose `.git` file points to another checkout on the old
Mac; copying that folder alone is not a portable repository. Fresh cloning is
preferred. macOS offloaded its six-byte `commondir` file and blocked even basic
Git reads; keeping that file downloaded restored access. iCloud storage was full.
Do not rewrite Git metadata or copy absolute worktree pointers to fix migration.

## 2. Current source, CI and installed candidate

- Implementation: `e270578568718afd2fd3450694dc8226a2a897a2`.
- Validation records and anchor correction through
  `17d985db61c60c59965b106525d841f503bbf64f` are documentation/ledger-only.
- Implementation CI passed: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/40614977219
- Follow-up CI passed: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/40615632941
- Local full suite: **1085 tests**, lint, release checks; verified Homey validation
  also passed. Check the new handover commit's CI independently on resumption.
- Installed owner candidate: running **Development 1.10.56**, non-clean direct
  installation at **28 October 2026 01:27:41 UTC**; not a store installation.
- Exact runtime fingerprint:
  `f1234365433db279bc9418a29beaaf863ef593d291864e6018de8388c4cf9ba2`.
  Documentation/AGENTS changes do not change this fingerprint. Recompute with
  `npm run release:check`; never identify an installed runtime by version alone.
- Mainline stayed untouched: local historical `master` is `8bb4e468e9bcc510c28049ec4e89736ac2733879`;
  remote `master` was `66b1cb5f828a53333739798281fce86125f61c28`. They differ;
  do not push local master or assume the difference is a new merge instruction.
- Last **recorded** store state: Test 1.10.56 / Build 70 and Live 1.10.3 / Build 18.
  Those portal observations are historical, not freshly reverified for this
  handover. The new diagnostic changes were not published to either channel.

Recheck current GitHub HEAD/CI and the installed host before making fresh claims.
The repository is not yet production-release-ready.

## 3. What changed most recently

**Physical STREAM 5000 expiry:** the three-minute watt/state freshness threshold
is unchanged. Physical monitors now have a five-second local cleanup timer,
separate from the existing one-minute connection watchdog. Checks are serialized,
coalesced while pending and cancelled on teardown. No extra EcoFlow requests,
faster reconnects or aggregate accounting changes. Five seconds is a normal
scheduling bound, not a hard real-time guarantee during blocked/failed SDK writes.

**Original STREAM history:** removed startup cleanup which deleted existing
daily-history capabilities merely because values were null. Existing capability
IDs/custom titles remain; day rollover still clears yesterday's values to
unknown. Fresh numeric history, including zero, updates in place. Missing tiles
are added only when their own data is returned, not as fabricated empty defaults.

Key implementation/tests:

- `lib/Stream5000UnitDevice.ts`, `lib/stream5000Readings.ts`,
  `lib/stream5000BatteryPresentation.ts`, `test/stream5000Lifecycle.test.js`.
- `drivers/stream/device.ts`, `test/streamEnergyLifecycle.test.js`.
- `scripts/check-stream-5000-acceptance.mjs`,
  `docs/STREAM_5000_MONITORING_ACCEPTANCE.json`.

## 4. Hardware evidence and its limits

The owner's currently paired 5000 is **ES21, PV-equipped STREAM 5000**, despite
earlier shorthand calling it AC5000. Do not conflate it with ES22 AC-only.
It is in a separate EcoFlow space. The owner's Dual CT had arrived but was **not
installed** at the last confirmed hardware checkpoint; do not assume it is a
usable independent grid meter. No 5000 aggregate is paired on the owner host.

The latest installation preserved all 11 device identities/settings, existing
capabilities, 99 Flow definitions and six cumulative meter sequences. Six daily
history tiles previously removed by the old cleanup returned with real numeric
history responses. There were no null daily tiles at the immediate upgrade
baseline, so that exact native null-preservation input is software-tested only.

EcoFlow explicitly showed Standby/0 W/1% at 01:28:42 UTC, matching Homey. The
standalone ES21 idle point is accepted for this fingerprint. The native Mac app
was quit at 01:28:43 and confirmed not running. Through 01:34:25, battery reports
continued roughly every two minutes, independently of fresh temperature. One
active subscription attempt, no reconnect; no expiry interval on this candidate.

Earlier `ac38129` hardware showed true silence expiry: power/state became null,
temperature stayed fresh and the tile became explicitly last-reported standby.
It exposed the old watchdog delay. That event is **not** hardware acceptance for
the new runtime's faster timer. Earlier supervised charging/discharging and
restoration are recorded in STATUS/RC, not approval for repeating those tests.

Open gates include actual fast expiry and recovery, retained-hint horizon,
controlled reconnect/rollback, sustained soak, configuration background refresh,
PV/socket/accessory scope, ES22 and linked-pack/model coverage, aggregate Energy
scope/continuity. The JSON ledger is authoritative per exact runtime/model/role.

## 5. Safe next work

1. Re-establish read-only access and verify installed state, device/Flow/counter
   baselines, and whether physical setup has changed since this checkpoint.
2. Observe a naturally sparse battery interval with the native app closed;
   verify numeric expiry within the five-second cleanup cadence, unrelated-field
   independence and explicitly non-live standby. Stop if fresh reports continue;
   do not create network silence, restart or trigger Flows to force a pass.
3. Observe natural receipt recovery and retained-hint expiry when available.
   Deliberate restart/reconnect/rollback needs a separate bounded owner approval.
4. Plan the remaining model/accessory/configuration/soak checks for a narrow
   monitoring release. Do not silently enable Home Battery (5000) Energy pairing,
   Dual CT Energy or 5000 controls to make the release look complete.

Keep remaining-time estimates unmapped; the bounded passive timer observer stays
disabled. New controls, automatic mixed-generation merging and new-product
admission are outside the monitoring release. Original STREAM guarded controls
and accounting remain distinct from these new gated paths.

## 6. Build/release checks on the new machine

CI uses Node 22 and Homey CLI 4.5.3. Use the committed lockfile:

```sh
npm ci
npx playwright install chromium
npm test
npm run lint
npm run release:check
git diff --check
npx --yes homey@4.5.3 app validate --level verified
```

Linux may need Playwright system dependencies (`--with-deps`, as in CI).
`npm run release:acceptance` / `release:monitoring` deliberately fail while
hardware gates are open. Do not weaken them to make a release pass.

Builds/dependencies under `.homeybuild/` and `node_modules/` are ignored and
regenerable; do not transfer them as authoritative source. Direct-install CLI
packing previously needed care to avoid a nested `.homeybuild` path and native
dependency loading in the desktop REPL. Follow the installed CLI source/docs
for the new machine; never reuse old host addresses, sessions or ad-hoc REPL
variables. Do not install with `clean:true`. Before any authorised install,
privately back up/read back definitions, settings, capability sets, Flows and
meters, validate the exact package and verify the running host independently.

## 7. Information map

- Current checkpoints: `docs/STATUS.md` (newest first; older blocks are history).
- Release scope/ledger: `docs/STREAM_5000_MONITORING_RC.md` and its JSON ledger.
- API/model research: `docs/STREAM_5000_API_REVIEW.md`,
  `docs/STREAM_REPORTING_API_AUDIT_2026_10_09.md`, `docs/STREAM_MODEL_COVERAGE.md`.
- Topology/mixed generation: `docs/STREAM_REPORTER_TRANSITION_PLAN.md`,
  `docs/MONITORING_REPORTER_TRIAL.md`, `docs/MIXED_GENERATION_VALIDATION.md`.
- Dual CT: `docs/DUAL_CT_RELEASE_GATES.md`, `docs/DUAL_CT_POWER_ENERGY_PATH.md`,
  `docs/DUAL_CT_GRID_ENERGY_PREPARATION.md`, `docs/DUAL_CT_CIRCUIT_PRESENTATION.md`.
- Controls/time: `docs/STREAM_CONTROL_CONTRACT_AUDIT.md`,
  `docs/STREAM_5000_REMAINING_TIME_AUDIT.md`, `docs/LEGACY_FLOW_RELIABILITY.md`.
- Community/coordination: `docs/COMMUNITY_FEEDBACK_ROADMAP.md`,
  `docs/STREAM_COORDINATION_PREVIEW.md`, `docs/COORDINATION_SOURCE_AUDIT.md`.
- Product photos/wireframes: `docs/assets/`, driver assets and their README files.
- Reproducible evidence: committed synthetic/masked `test/fixtures/` and tests.

Older sprint documents may say Beta/opt-in or local/unpublished for superseded
checkpoints. Current source has ungated physical 5000 monitoring; aggregate
Energy pairing has its own default-off consent. Do not restart completed sprints
or mistake catalogue support for hardware acceptance.

## 8. Private data and local-only recovery

GitHub is public. Credentials, app-account sessions, `env.json`, Homey CLI tokens,
full device IDs/serials, raw household reports/screenshots and support email
attachments must **not** be uploaded. They are not portable through GitHub or
Codex chat memory. Authenticate on the new machine through the normal supported
flow; do not paste secrets into chat or reconstruct them from local caches.
The Homey hub retains its own installed settings/data; cloning does not move or
reset the hub. Access still needs owner-authorised authentication.

Before wiping the old machine, privately transfer any needed evidence. The
latest migration pack is held outside the repository under the old machine's
`.codex/private-handoffs/` directory. It includes a Git recovery bundle of local
refs and a selected recent telemetry/screenshot archive, **not** credentials,
complete Homey backups, raw baseline inventories or all historical private files.
The local companion manifest identifies the private temporary evidence folders.
Temporary `/tmp` evidence can disappear; that selected archive is a safeguard,
not a complete hardware backup. Older raw reports/support correspondence and
credentials need a separate owner-controlled secure transfer if required.

Seven historical commits were not reachable from fetched remote refs at the
handover audit (`1a39a4c`, `2679d9a`, `fe84e33`, `5c41522`, `8bb4e46`,
`ed81e94`, `c7f9804`). They are kept in the private Git bundle; they are not
current-work omissions to merge automatically or authority to overwrite master.
No local stash or untracked project source was found. Preserve the bundle if
those historical local branches matter; the active diagnostic source is on GitHub.

## 9. Prompt to resume in another Codex instance

> Continue this EcoFlow STREAM repository on
> `codex/mixed-generation-reporting-diagnostics`. Read AGENTS.md,
> docs/CODEX_HANDOVER.md, the latest docs/STATUS.md checkpoint and the monitoring
> RC/acceptance ledger first. Verify GitHub HEAD/CI and local dirty state; do not
> assume the default master is current. Keep Mainline, Test and Live unchanged.
> No publishing, installation, pairing, battery settings/tasks, Flow execution,
> forced silence/reconnect or Energy/control activation without fresh approval.
> Start with a read-only state/acceptance review and propose the next bounded
> hardware check. Preserve paired tiles, Flows, custom titles and counters. Raw
> evidence/credentials stay private; do not depend on the old chat's REPL state.

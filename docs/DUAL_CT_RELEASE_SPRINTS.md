# Dual CT property Energy release sprints — 29 October 2026

Owner's release target is CT1 as the authoritative property Energy meter.
This authorizes diagnostic-branch engineering, not installation, Energy adoption,
hardware operation or channel publication. Mainline/Test/Live/installed app stay
unchanged. No additional community capture requests are required for these sprints.

| Sprint | Deliverable | Current state |
| --- | --- | --- |
| 1 | Explain telemetry silence versus rejected candidates | Local preview frame/accept/reject counts and independent receipt ages, reset on scope teardown, numeric-free support projection; tested, not installed |
| 2 | Exact-candidate hardware acceptance | Separate strict CT1 ledger/checker and physical protocol; native firmware observed, mapping/import comparison and natural recovery partial; no hardware gate passed |
| 3 | Homey write lifecycle | Separate device adapter using real persistent session; committed totals before projection, consent/contract rechecks after async writes, failure/expiry/teardown and coalesced refresh tests; local, unwired/default off |
| 4 | Qualified source and new-device adoption | Separate driver/UI/inventory/subscription path wired in 1.10.59, hidden/default off. Physical W/sign/timing contract and trustworthy fresh firmware readback remain pending. No preview conversion |
| 5 | Native candidate acceptance | Pending separately approved preservation baseline, non-clean installation, explicit source adoption/exclusions, native persistence/restart/rollback and physical energy comparisons; then exact-candidate 48-hour soak |
| 6 | Release delivery | Pending exact final source review/CI/archive, approved Test delivery and readback, reviewed Mainline integration and certification/Live decision |

## Historical source and channels — see newest STATUS for current candidate

Base e469c37 is pushed and exact CI 40781605070 passed. That source is version
1.10.57, but fresh portal review on 29 October confirms Test is still 1.10.56 /
Build 70, Live is 1.10.3. Installed Homey is Development 1.10.56; its exact package
fingerprint was not freshly hashed. Earlier local-only handover entries remain
historical; they do not describe e469c37's source/CI delivery. The new sprint
changes are checkpointed on the diagnostic branch after local validation; exact
CI must be verified independently. They are not installed or published.

## New hardware observations and limits

Owner confirms CT1 at the single-phase property incomer, including a downstream
submeter, and CT2 disconnected. Original batteries and an electrically connected
microinverter belong to distinct reported cloud grouping. Do not equate cloud
membership, Homey zones and electrical boundaries or silently merge sources.

Read-only native EcoFlow shows a Dual CT associated with the house STREAM 5000,
model name EcoFlow Smart Meter Dual CT, firmware V1.0.0.41. Its near-time grid and
Phase A readings agree approximately with the preview CT1 candidate at an import
operating point. These are sequential UI observations, not simultaneous calibrated
samples. Native unused phases show unavailable; preview candidate zeroes must not
be promoted to verified connected phases. Firmware naming is native UI evidence,
not yet a demonstrated firmware readback available to the future runtime adapter.

Both original direct-meter and Dual CT accepted telemetry resumed naturally after
an earlier multi-minute stale interval; no agent restart/reconnect/setting change
was used. The new transport diagnostics were not installed and therefore cannot
retrospectively identify that gap's cause. Nondecreasing sampled existing counters
do not establish preservation through a future upgrade or accuracy across gaps.

Original meter Energy inclusion still describes a whole-property meter despite
its reported downstream role. Other property sources reviewed are excluded.
Correct this only through an explicitly reviewed source transition; do not leave
an unintended grid source or activate Dual CT merely to obtain an Energy tile.

## Acceptance and remaining dependency

See [hardware protocol](DUAL_CT_ENERGY_RC.md) and
[ledger](DUAL_CT_ENERGY_ACCEPTANCE.json). Firmware/mapping/scope/recovery are only
partial observations on an older installed runtime; source timing remains null.
The developer-owned contract registry remains empty, runtime false, and the
existing preview contributes no Energy. No synthetic injection or user label can
register a contract. Test success must not close physical gates or authorize writes.

Before sprint 4 can be called production-qualified, establish physical direction,
power units and timing/replay behavior and a dependable firmware/model readback.
Native counters/reset periods stay separate research; the intended route integrates
observed CT1 watts without gap backfill. Export/zero, interval comparisons, native
storage/upgrade/rollback and soak remain pending, including model/role-specific
STREAM 5000 gates outside this Dual CT ledger.

Local verification: 1114 tests, lint, release/diff checks and pinned Homey CLI
4.5.3 verified validation pass. Runtime fingerprint:
`ae5f67bfc05c1bbf1e91b88badfd232de594fe7c1875233271d53e70bb540e37`.
The hardware-required command remains nonzero by design.

## Sprint 4 follow-up

Diagnostic 1.10.58 adds the source-specific adoption workflow and combined
release:full meter/battery readiness command. 1126 tests and locked Node 22 checks,
lint/release/audit/verified validation pass. It is not installed or published.
See SPRINT_4_6_ACCEPTANCE_PLAN.md for the battery matrix and approval boundaries.
No production contract is registered and no Energy driver or pairing UI exists.

## Owner diagnostic update follow-up

Owner-approved non-clean Development 1.10.58 update completed on 29 October at
16:50:07 UTC from exact source 85c5cad (CI 40913604866 passed). Full private
preservation readback matches 12 device definitions/settings/capability metadata,
99 Flow definitions and app-setting hashes; six counters are nondecreasing.
This is a diagnostic installation, not Energy adoption or completion of sprint 5.
Mainline/Test/Live remain unchanged. See newest STATUS/monitoring RC for limits;
earlier local/not-installed wording above is historical preparation.

## Diagnostic 1.10.59 engineering follow-up

The separate CT1 Energy driver, native pairing review, Homey contributor reader
and shared subscription lifecycle are wired and source-tested. The new driver
is hidden/default off, with no registered contract or firmware reader; no Energy
activation or preview conversion occurs. Account Repair for existing app consumers
is source-tested without deletion/re-pairing, and release readiness rejects
unqualified source admission. 1156 tests pass; native acceptance remains open.
See newest STATUS and ENERGY_RELEASE_COMPLETION.md. This is engineering progress,
not completion of sprints 4–6, owner installation or store delivery.

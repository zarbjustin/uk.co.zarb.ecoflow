# Read-only coordination Flow cards — sprints 1/2

Current follow-up: original observation cards are in Test v1.10.55. The local
release-hardening wave shares the explicit candidate-source classification and
adds repeated-session/coexistence replay tests without new cards, consent,
controls or Energy activation. See RELEASE_CANDIDATE_CHECKLIST.md for remaining
native/hardware acceptance. Earlier local-only statements below are historical.

17 October 2026. Diagnostic branch only, local/unpublished. No Flow was created
or installed, no monitor was activated on a Homey, and no control or Energy path
was enabled. This extends the selected-source workspace, not the Dual CT
candidate driver's automation permission.

## Cards prepared

All six are app-level cards for the one explicitly selected installation. No
per-unit charging control, new driver, capability, action or migration is added.
IDs and titles/hints are supplied in EN/DE/NL.

| ID | Type | Meaning |
| --- | --- | --- |
| `coordination_assessment_changed` | WHEN | Advisory state/reason changed; tokens `state`, `reason`. |
| `coordination_readings_changed` | WHEN | Selected bundle availability changed; tokens `availability`, `reason`. |
| `coordination_readings_current` | AND | All selected capability readings are current and time-coherent. |
| `coordination_external_priority` | AND | External SOC satisfies the session's hysteresis and battery power is within ±20 W. |
| `coordination_grid_export_sustained` | AND | Actual grid export exceeds X W over Y seconds of advancing observations. |
| `coordination_circuit_power_sustained` | AND | Chosen branch role and explicit direction exceed X W over Y observed seconds. |

These are observations, not permission to charge. Priority does not alone prove
there is surplus; export does not prove solar origin. Hybrid inverter throughput
is never added to grid export, and a load branch is not whole-house consumption.
The circuit card rejects a role/direction mismatch. Conditions must not be used
as electrical protection or as a substitute for commissioned control contracts.

## Consent and lifecycle

Page-preview consent never starts a Flow monitor. A separate default-off
checkbox and **Start 30-minute Flow observation** explicitly authorise selected
device reads and Flow events. The warning explains that even a read-only WHEN
card can execute the owner's existing THEN actions. No user Flow is created or
modified by the app. Review intended Flows before starting the session.

Only the already selected bindings are read, sequentially through the existing
GET-only reader. There is no inventory enumeration in the monitor. Polls run
about every 15 seconds after the previous cycle settles, with a ten-second
cycle deadline. Consent, values, advisory history and lease are RAM-only;
restart never resumes monitoring. The fixed 30-minute lease cannot be extended
by condition evaluations, status requests, cached data or page visibility.

The monitor continues when the settings page closes; the separate page reader
still revokes its own access on hide/exit. **Stop Flow observation**, unchecking
Flow consent, applying saved source changes, account changes, app shutdown and
lease expiry discard readings/history and close the reader. Locally editing
sources, confirmations or thresholds stops a session started by that page.
Another page's unsaved form is not a change to the running monitor's bindings.
Status is a manually requested snapshot; use Check status after reopening.

Start uses a server-owned setup revision. Stop and applied setting changes
advance it, so an earlier delayed Start cannot undo them. Browser operation
generations ignore superseded replies. A failed/timed-out Start is followed by
a compensating Stop; an unconfirmed Stop is clearly labelled with retry/restart
guidance. A read timeout/failure closes the reader, clears continuity, and retries
from a new connection/session after 15 seconds within the original lease.
Results from revoked generations cannot recover state or recreate timers.

## Validity and condition semantics

The existing binding adapter validates availability, device/driver/capability,
numeric type, gettable metadata, explicit W/kW/% units and polarity. It uses only
the supplied capability `lastUpdated`. Read/request time is never substituted.
Each reading must be younger than 60 seconds, not future-dated, and all selected
readings must be within five seconds of each other. An optional circuit is part
of that same bundle and must also qualify. Unchanged-value timestamps may expire
conservatively. Capability metadata is not a verified hardware heartbeat.

Missing, invalid, stale or incoherent bundles **reject condition evaluation**,
rather than returning false. This prevents inversion from turning unknown into
true. Conditions do not fetch or advance the monitor. A separate expiry timer
and synchronous checks prevent cached positive decisions after expiry.

Power-threshold arguments are finite numeric 21–100000 W and 1–1800 seconds;
strictly greater than the threshold is required. They are research observation
ranges, not equipment limits. Sustained duration uses actual observation spans,
advancing source timestamps and gaps no longer than 30 seconds, in bounded
128-entry per-field histories. Repeated evaluations/cached timestamps cannot
manufacture dwell. Gaps, identity/policy changes and reconnection reset it.

External priority defaults to 98% start / 97% stop, configurable in the session.
On entry, SOC must reach the start threshold; an existing priority observation
can remain true above (not equal to) the stop threshold. Active external charging
or discharging outside ±20 W clears it. The advisory engine separately checks
grid exchange, STREAM discharge, conflicting flows, dwell and cooldown. No
charging target, pause/resume command or external-app action is produced.

Known `smartmeter_dual_ct_preview` sources and `dual_ct_preview_*` candidate
capabilities are explicitly rejected at Start. Their existing display-only
restriction is not bypassed through cross-app selection. P1/original meter or
another appropriately reviewed capability source is needed for this increment.
Other vendors' metadata still needs owner review and hardware commissioning;
not matching this deny-list is not proof of a verified sensor contract.

## Events, privacy and evidence gates

State/reason and availability/reason tokens are allowlisted machine-code strings;
no watts, SOC measurements, names, source IDs, tokens, raw provider errors or
packet data are emitted or added to support exports. Events occur only on
transitions, not every poll. Initial available/waiting observations can emit
events after an explicit Start. Explicit revocation/expiry/shutdown suppress
post-revocation events; consumers must recheck conditions before using old
event tokens. Trigger delivery is not persistent command authorisation.

The monitor owns its previous state internally and ignores caller-supplied
history/manual measurements. It does not share dwell or consent with the
stateless rehearsal API or settings snapshot. All flags remain advisory-only,
with controls/Energy/solar-origin/measurement-freshness verification false and
zero command writes. Existing Flow IDs, drivers and Energy declarations stay
unchanged; six observation cards are added, not existing actions broadened.

Software regressions use synthetic capabilities, clocks, a local HTTP reader
fixture and desktop/mobile browser workflows. They do not certify Fronius/BYD,
Solis, P1, mixed-generation STREAM or actual Homey Flow scheduling. In particular,
Ed's reported five-minute Solis lag cannot be treated as current for these
conditions. Do not relax timestamps or label stale values current to make a card
qualify. Production/controller acceptance still requires owner hardware.

No more Robert captures are requested for these sprints. Next is separately
scoped control-contract research and owner-hardware shadow validation, not
enabling charging or migrating Energy. Mainline, Live and Test publication stay
outside this local increment.

References: [Homey Flow lifecycle and rejection semantics](https://apps.developer.homey.app/the-basics/flow),
[source workspace](COORDINATION_SOURCE_WORKSPACE.md),
[advisory contract](STREAM_COORDINATION_PREVIEW.md),
[remaining roadmap gates](STREAM_EXTERNAL_BATTERY_ROADMAP.md).

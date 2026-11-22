# Sprint 5 revised maintenance review — EcoFlow AI owns reserves

## Decision and current evidence

The owner confirmed intentionally changing native reserve levels and selecting
EcoFlow AI reserve management. Preserve that choice. The historical Homey
ownership fault is consistent with a deliberate external change; it is not
authority to restore Homey's old reserve targets or resume its controller.

Read-only inspection on 6 November 2026 at 09:58 UTC found one execution config
and state. The execution Flow's historical name no longer matches; its recorded
stable identity still exists and its cards reference the exact resident reserve
runner. The private target record pins those identities and full definitions.
Never select an unrelated Flow by an approximate name.

- Execution Flow enabled, not broken; config enabled.
- Historical ownership fault remains latched; no pending intent, active run lock
  or stopping flag. Native lease completed and has no fault.
- Two physical 5000 configuration records and the aggregate report
  `intelligent_plus`, with explicit fresh receipt ages of 181–267 seconds.
  This is subscription-derived evidence, not independent native UI inspection.
- Six inline legacy reserve cards exactly match the unconditional no-op delegate
  source. The inspected standard/advanced Flow definitions contain no direct
  reserve action or inline reserve-write pattern. External script bodies were
  not exhaustively audited; this is not proof against all external/manual writers.
- Resident runner hash is `874a2c6c69e1d488e9143a051290bd00fc118429302e7d94631c1bf963b4c8d7`,
  different from the 2 November record. Its disabled-config no-command early
  return is present. Preserve this current source; do not deploy an older runner.

No live settings, Flows, state, lease, reserves, native mode or tasks were changed.
Inspection receipts and exact proposed target patches are private under
`../work/output/copilot-bug-bash-2026-11-06/sprint-5/ai-owner-maintenance-review/`.

## Additional approval requested

Target: the owner's explicitly named household Homey in the private review.
This review requests permission to pause the existing Homey reserve executor and
keep it paused while EcoFlow AI remains in charge. It does not request native
battery changes. The previously approved exact candidate installation remains
conditional on the revised preflight below. Nothing is executed by preparing
this document.

Only two intended live edits:

1. Set the recorded dedicated execution Advanced Flow's `enabled` to `false`.
   Preserve its ID, name, folder, cards and all other metadata.
2. Set only `enabled: false` in `EcoFlow_Coordinated_Execution_Config`, preserving
   all other parsed configuration fields, revision and device bindings. Do not
   change planner/Office flags, policy, limits or the execution state variable.

This disables Homey's scheduled reserve decisions/commands; EcoFlow's native AI
continues determining battery behaviour. It does not disable the EcoFlow Homey
app, telemetry, Energy, unrelated Flows or other independently owned controls.
Do not promise historical Homey peak-readiness targets or cost optimisation
while its executor is disabled. Native AI outcomes are outside that planner.

## Ordered execution after explicit approval

1. Recheck exact target, branch/source, approved archive and recovery hashes,
   current runner binding/hash and uniquely identified Flow/config. Refuse drift
   or an uncertain previous installation receipt. Capture original exact Flow
   and config/state/lease/gate privately, with global credential-bearing settings
   represented by equality hashes. Preserve original fault/history unchanged.
2. Disable only the dedicated Flow first; read back the exact edit. Wait for any
   already-started invocation to finish. Require zero pending intent, no active
   run lock, no stopping or native command activity, and a completed fault-free
   native lease. Bound waiting to three minutes with fresh checks; defer if not
   safe. Never release/renew/edit a lease or issue reserve commands to get idle.
3. Disable only config `enabled`, then read it back and verify all other fields
   match the baseline. Recheck quiescence after the pause. Preserve the historical
   owner-explained House ownership fault, expected targets and history as evidence.
   Do not clear/rebase them. A different/new fault remains a blocker.
4. Verify the legacy delegate cards remain no-op with execution disabled and the
   resident runner's disabled path cannot invoke its battery transport. Examine
   any newly discovered relevant reserve writer before proceeding; do not silently
   disable extra Flows or scripts. Preserve app-level control gate settings.
5. Recheck current native/receipt mode and tasks read-only. Keep AI/Intelligent+
   and current native limits/reserves/tasks as the owner-selected configuration;
   do not force Self-powered, empty task lists or the old expected reserve.
   AI may change reserves naturally, so a different percentage alone does not
   authorise overwriting it. Record uncertainty rather than infer native state.
6. Capture the fresh full pre-install preservation baseline specified in
   [the original artifact review](SPRINT_5_INSTALLATION_REVIEW_2026-11-06.md):
   device identities/definitions/settings/capabilities/custom titles, full Flows,
   Insights identities, cumulative/daily capability coverage, Energy definitions,
   global setting hashes and available precise checkpoint health. Capture pause
   baseline separately: only the two approved enabled fields may differ from
   the original automation baseline. Unknown store/backup coverage remains explicit.
7. Install the already-approved exact archive once non-clean Development,
   `clean=false`, `debug=false`. Record intent before calling the installer and
   receipt afterward. This restarts readings for ALL paired EcoFlow app devices.
   No second install/restart or automatic rollback after an uncertain result.
8. For up to 30 minutes, perform read-only startup/preservation checks and the
   owner-assisted native/phone comparisons in the original review. Validate
   counters and source/session receipt provenance without claiming an independent
   installed-filesystem hash. Never infer a physical unit's power from aggregate
   values. Existing Energy inclusion remains unchanged.
9. Verify both execution switches remain disabled and the old fault/history,
   configuration bindings and runner source are preserved. Leave them disabled
   after success OR failure. Do not automatically restore the previous enabled
   state; resumption requires a separate owner decision to relinquish native AI
   control and a fresh ownership review.

The revised preflight intentionally replaces the old requirement to clear all
faults/match Homey's old expected reserves: after the approved pause, the exact
owner-explained historical ownership fault may remain as a latched historical
record, with no active native lease/command. This is a maintenance exception
requiring explicit review, not a relaxed runtime guard or generic fault waiver.
If safety cannot be demonstrated without a battery/settings change, stop.

## Exact artifacts and recovery

Candidate source HEAD: `169495793b8932dc6565db546ccd008081032ae6`;
reviewed production: `e8c48fea948ab3adc82c26bfd1a1db93215812aa`.
Version remains **1.11.20**.

- Candidate archive SHA256: `73c6aa47496d745a2081af53ae19db442d5f8bc1fc4ca2a65503ac809b9d9df4`.
- Source fingerprint: `81fab286a28569d7c1bd7f9fb714ebf43ddaee296cca61c6a142c6a56adacbe0`.
- Frozen historical recovery archive SHA256: `33457061b26f8a28ae6e3b23d1ccc6b8ff7a36448ce435df5cdad0bca0414667`.

Files/manifests remain in the Sprint 5 `provenance-review-2026-11-06/` directory.
The recovery artifact is neither a store backup nor a current installed-source
attestation. Rollback is untested and requires separate approval/current-counter
review; no automatic source/store restore. If the pause succeeds but install or
validation cannot proceed, leave execution disabled, retain evidence and report.
If only the Flow pause succeeds, report that partial state; do not re-enable it
or broaden the config edit without the reviewed checks.

## Limits

No battery command, mode/task/reserve change, account Repair, re-pair, forced
silence/reconnect, Energy adoption/source change, tester contact or extra restart.
Mainline, Store Test and Live remain unchanged. No publication, commit or push.
No 48-hour observer is started by this procedure. Review the initial validation
before a separately bounded ordinary-use soak. ES22/three-phase/independent
interval-energy and unavailable natural states remain open hardware gates.

# No-broad-API candidate 1.11.22 — 7 November 2026

## Owner decision — source push only

Owner accepted the documented tradeoffs and authorised commit/push of 1.11.22
and exact-commit CI checks. No installation, publication or battery/settings
change is authorised. The preparation snapshot below predates that source commit;
see the newest handover checkpoint and local final receipt for the pushed SHA/CI.


## Review outcome

Prepared locally at the owner's request; **not committed, pushed, installed or
published**. HEAD remains a77d22ffd8ebcf44e78093443494af4e759fcfa3 on
codex/mixed-generation-reporting-diagnostics. Fetch before editing found local
and remote at the same commit. Prior dirty handover/native/installation records
were preserved. This working-tree candidate has no exact-commit CI result or
independent multi-model review. Prior CI does not validate these changes.

Installed Development remains 1.11.21; last store read remains Test 1.11.21/build88
and Live 1.10.3/build18. No channel write was performed. EcoFlow AI, Homey reserve
execution, battery configuration, Flows and Energy settings were not changed.

## Important correction and changed product contract

Earlier permission analysis missed a dependency: the broad reader was also used
by Dual CT's inventory/overlap checks, not just optional coordination. Merely
removing the permission would break Dual CT pairing/startup. This candidate
replaces that dependency with supported SDK enumeration of this app's own devices.

- Remove homey:manager:api in compose/generated manifests; retain geolocation.
  Remove the production owner-token/loopback reader. No new token/proxy/companion
  workaround is introduced.
- Automatically inspect EcoFlow-owned property meters through SDK getters.
  Incomplete, malformed or duplicate owned inventory fails closed. An included
  EcoFlow cumulative meter still blocks conflicting adoption. Excluded/downstream
  meters remain distinct. Undefined SDK cumulative overrides fall back to the
  declared driver definition, rather than hiding a declared cumulative meter.
- **Automatic checks of meters from other apps are removed.** Inventory explicitly
  says app_owned / externalInventoryVerified=false. Existing mandatory external
  review acknowledgement remains; EN/DE/NL wording requires checking Tibber, P1,
  Emporia and similar sources in Homey Energy. Existing stored consent is retained,
  but it is not a fresh global scan. Owner must review external roles before any
  candidate installation/rollout and whenever external roles subsequently change.
  This is a reduced automatic guarantee and needs explicit product review.
- **The former in-app cross-app picker and background Flow monitor cannot start.**
  Saved selections/card IDs remain, but previous advanced behavior is unavailable:
  WHEN cards emit no new observations and AND conditions fail closed, including
  inverted conditions. No migration executes THEN actions. Ordinary EcoFlow
  device Flow actions are unchanged. The migration panel explains this in all
  three locales without displaying private source IDs or running network reads.
- [Separate owner automation design](COORDINATION_EXTERNAL_RUNNER_DESIGN.md) is
  prepared, not implemented/deployed. It may use the existing authenticated pure
  advisory endpoint with scalar inputs. No mandatory companion, automatic
  coordinator restart, battery policy or new execution permission is proposed.

## Preservation and qualification

All generated manifest fields except version/permissions equal HEAD: driver IDs,
capabilities, Energy definitions, pairing and Flow IDs/arguments are unchanged.
No binding/counter migration, accounting algorithm, phase mapping or source timing
change is included. Settings keys/Insight identities are retained by source design;
that is not an installed-device preservation claim for this uninstalled candidate.

A deterministic local projection replayed 15 recorded owned definitions using
SDK-shaped getters. It found complete owned inventory and the excluded original
meter, matching the former global classifier's zero included contributors. This
is not an actual SDK readback. SDK getEnergy/getSettings visibility, startup and
existing Energy role behavior still need exact-candidate installed validation after
separate approval. Never claim whole-Homey completeness from owned inventory.

## Checks and artifact

Committed-lockfile npm ci succeeded (also in isolated public-source export);
Node 22.23.4, Homey CLI 4.5.3 verified validation passed. npm test: **1,520 passed,
zero failed/skipped/cancelled**. Lint, release:check and whitespace checks passed.
Dependency audit in npm ci: zero vulnerabilities. Generated metadata preservation
comparison passed. Existing pure protocol tests remain; retired privileged-reader
and old picker tests were replaced with explicit reader-denial/migration UI tests,
not silently skipped. New tests cover owned overlaps, unknown inventory,
external acknowledgement, identity stability and undefined SDK overrides.

Runtime-source fingerprint:
`96c4c830907d7d3e8b3c72886d78da52b714e8f76c62590ef404f301f159f147`

Normalized review archive SHA-256:
`5cb748296ca338f41353eddc03aef0d05af9081b2d6f6dd20db5d739d4b1cc7a`

Public-source export file manifest SHA-256:
`b949b1481f9ced5be23f23eb54801f5860a75f19750280de320ff9e7ea8e7a8f`

Archive is built from a public-source-only export. Compiled entrypoints match the
verified CLI build. Two normalizations of that same CLI archive are byte-identical;
this is not a claim of two independent rebuilds. Full per-file manifest, source
patch and logs are in the private local review directory. Later handover/receipt
text is outside this exported source snapshot; runtime identity is unchanged.

`release:full` deliberately exits 1. Native/model comparisons, applicable
three-phase qualification, backup/rollback compatibility and exact-runtime
48-hour normal-use gates remain open. No ledger was weakened, no gate closed and
no soak started. Single-phase/ES21 evidence cannot qualify three-phase/ES22.

## Native observation on installed 1.11.21

Read-only native EcoFlow view at 12:37:57 UTC showed system SOC 100%, Standby 0 W.
Homey at 12:38:23 UTC showed system/unit SOC 100% but battery watts/state unknown.
This does not pass idle/recovery validation or prove a mapping defect. Preserve
unknowns; no zero filling. This evidence applies to installed 1.11.21, not the
uninstalled 1.11.22 candidate. No native configuration was changed.

## Proposed next step

Review the reduced external-meter automatic guard and advanced-feature migration
first. If accepted, authorise commit/push and exact-commit CI separately. Then
prepare a fresh target-specific safety/preservation baseline, external-meter role
review and compatible rollback artifact before seeking exact-archive installation
approval. Updating the household app restarts readings for all its EcoFlow devices.
Do not carry forward an older installation approval or resume Homey reserve
execution. Keep Test, Live and Development unchanged until separately approved.

Codex remote-model context used public source and sanitized projections only.
Private original household captures/credentials remain local; no private originals
were sent to another model, GitHub or a tester. No external contact was made.

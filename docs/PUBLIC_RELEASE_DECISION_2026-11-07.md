# Public App Store release decision — 7 November 2026

> Subsequent correction: the old broad reader also served Dual CT overlap checks.
> The optional-only dependency analysis and unsent Athom draft below are historical
> and must not be reused unchanged. Owner selected a no-broad-API candidate; see
> [1.11.22 review](NO_BROAD_API_CANDIDATE_1_11_22_2026-11-07.md) for the actual changed
> external-meter and advanced-feature contract. No historical record is a new approval.

## Decision now

Owner wants to move from community Test to the public Homey App Store.
**No Live promotion or certification submission was performed.** Current requested
full-release check still exits1. This document prepares the concrete product/
permission decision; it does not weaken acceptance gates or change permissions.

Source remains a77d22ffd8ebcf44e78093443494af4e759fcfa3; source fingerprint
 e8d74b27a22e9624a961902795c08ac962c7b72308584c8557ff26d386d20445.
Fresh authenticated store read7November:Test1.11.21/build88,Live1.10.3/build18.
Development1.11.21 remains running. Preserve existing uncommitted installed/native
result reports and handover changes. No production implementation edited.

## New concrete permission finding

Compared actual store build metadata:
- Live18 requests homey:manager:geolocation.
- Test88 requests that permission plus homey:manager:api.

Broad API access is NEW for public users,not an already-certified unchanged grant.
Official [permission rules](https://apps.developer.homey.app/the-basics/app/permissions),
checked7November, say newly added permissions prevent automatic app updates;
API permission grants complete Homey access,should be main functionality,and
physical-device integrations generally should not request it. Further review/
rejection risk is real; no Athom eligibility approval is established. Existing
agent-review GET was unavailable; this is not a pass or rejection. Do not infer
permission eligibility from successful CLI validation or Test publication.

Source trace:lib/coordinationWorkspace.ts:createHomeyCoordinationReader obtains
an owner API token and reads the devices manager. App endpoints create it only
for opt-in coordination workspace/Flow monitoring (app.ts). The implementation
constrains its reads,but the platform grant is still broad. Ordinary EcoFlow
telemetry/control transports and SDK Energy definitions do not call this reader.
Do not claim whole-Homey access is mandatory for basic EcoFlow pairing or Energy.

## Product decision requested; no change applied

**Recommended path:** prepare a candidate without broad API access,retaining the
core EcoFlow integration and an explicitly designed separate path for advanced
cross-app coordination. Before implementation review exact feature/Flow impact:
- Preserve paired identities,counters,history,Energy definitions,custom titles,
  settings and supported original device actions. No deletion,re-pair or counter
  migration to simplify the release.
- Preserve advanced Flow IDs/configuration/history; do not leave cards silently
  broken or claim existing cross-app behavior is preserved without a supported
  replacement. Inventory affected optional workspace/monitor users and explain
  changed availability or migration before applying it.
- An owner-run HomeyScript or existing suitable automation app could provide a
  separately authorised reader using the existing scoped EcoFlow interface.
  This is a design option,not an implemented migration or permission approval.
  Do not create a valueless dependency-only companion or a new mandatory install.
- Battery execution stays disabled; native EcoFlow AI retains control. No changes
  to the separate owner automation project or native battery configuration.
- Manifest/feature changes need a reviewed source candidate,new exact CI/package,
  separately approved local update and validation. Do not run48hours on one
  artifact then certify another changed runtime as if the evidence transferred.

**Alternative:** retain current features/permission and prepare an honest Athom
eligibility request. Explain optional cross-app usage; do not call it essential
if basic integration works without it. No guarantee of approval. Draft below is
UNSENT. Owner preference is pending in Codex; elapsed time is not approval.

## Unsent Athom eligibility draft

We maintain the independent EcoFlow STREAM integration. Current Live1.10.3 uses
geolocation; Test1.11.21 additionally requests homey:manager:api. The extra grant
is used for opt-in cross-app coordination,reading selected Homey device sources
and monitoring user-configured Flow conditions. Core EcoFlow device monitoring
and SDK Homey Energy definitions do not require the owner-API reader.

The implementation limits its requests to GET device reads and explicit source
selection,but we recognise that the grant itself gives broader Homey access.
Before public submission,can you confirm whether this use is eligible within
the physical-device integration,or should it be moved to a separately authorised
owner automation/tool? We can provide public source references and tests. We are
not requesting that validation or hardware limits be treated as completed,and
we have not enabled automatic Live promotion while resolving this question.

## Concrete release track

1. Resolve permission/optional-feature path first. Do not silently change a live
   capability or grant. Inventory support claims and their production/trial scope.
2. Freeze exact final candidate,verify full checks and packaging,then publish
   scoped Test only with the relevant owner authority. Keep current Test/Live/
   Development unchanged until any new action has its explicit review/approval.
3. On approved exact Development artifact,complete native charging/idle and
   applicable unit/system scope comparisons. Main linked physical power remains
   unknown where its signed source is unqualified. Missing native watt/state
   display is not proof of idle. Existing discharge observations corroborate;
   ES21/single-phase cannot accept ES22/three-phase.
4. Approve and run exact-artifact48-hour ordinary-use validation after agreed
   applicable prerequisites. The48-hour criterion is this project's quality
   gate,not a quoted mandatory Athom duration. No retrospective start time and
   no implication that installed elapsed time equals observed soak coverage.
5. Assemble scope/limitation matrix,test/CI/archive/native/soak receipts,EN/DE/NL
   copy and reviewer instructions. Decide whether unresolved roles are blocking
   the intended full scope or explicitly remain consented trials. That decision
   needs owner review; do not hide/delete supported drivers or waive checks.
6. Submit for certification with explicit publication behavior reviewed. Athom's
   [publishing documentation](https://apps.developer.homey.app/app-store/publishing)
   distinguishes Test,certification and Live; no submission/certification approval
   is claimed here. Promotion waits for the agreed scope/evidence and approval.

## Prepared48-hour observation specification — not started

- Artifact fixed for entire run; no install/restart/pairing/settings/Flow/Energy/
  reserve/task/control/reconnect/silence. Native AI and disabled Homey execution
  remain. Agree applicable model/role acceptance scope before starting.
- Baseline0h,24h,48h complete private identity/definition/settings/Flow/Insights/
  Energy readbacks and numeric meter floors. Unknown readings remain unknown.
- Cached Homey inventory at most once/minute; app/support health at most once/
  five minutes. No new vendor MQTT session or forced device refresh. Minimum
  private data only; allowlisted counts/hashes in public handovers.
- Track last numeric counters across unknowns,source ownership,per-field stale/
  failed evidence,queue loss/backlog,checkpoint failures,availability/app state
  and resource trends where accessible. Current support queue exports cover
  battery drivers; do not claim complete accessory visibility without evidence.
- Record observation gaps and coverage; Mac sleep/network failure can interrupt
  collection. Do not fabricate a continuous48-hour pass or backfill unseen energy.
- Stop and preserve on counter decrease,identity/ownership/history loss,unexpected
  control/configuration change,crash,repeated accounting loss/write failures or
  false freshness. No automatic restart,rollback,fault clear or lease edit.
- Native charge/discharge/idle and independent interval windows at agreed times;
  absent transitions or missing native reference remain uncovered. Do not set
  accuracy tolerances after seeing results. No background recorder created here.

## Current overnight evidence and constraints

Read-only Homey snapshot7November confirms1.11.21/running,intelligent_plus,fresh
empty native task lists and disabled Homey execution. System and one physical
record naturally report idle; other linked signed-unit power remains unknown.
Native Mac is locked; owner was asked to unlock manually. No unlock bypass or
native UI comparison was attempted past that lock. No new charge/idle gate closed.
Current source/API/store assessment proceeds independently of that missing view.

Full readiness command ran honestly and failed for missing exact-runtime battery/
Dual CT hardware gates. Earlier1510-test/CI/package results remain source receipts,
not newly rerun full tests or physical signoff. Installed/read-only elapsed hours
are not automatically a valid48-hour soak. Firmware,scope,energy intervals,
community hardware and policy/UX decisions remain visible in the scoped matrix.

## Records and boundaries

External receipt:
../work/output/public-release-decision-20261107T010719Z/FINAL_RECEIPT.md.
No contact with Athom/testers,permission change,source fix,installation,restart,
publication,controls/Flow/Energy or battery change. Private metadata/snapshots stay
restricted locally; only deterministic projections reviewed. No raw household
records,credentials,private histories or original images loaded into hosted
context or committed. Source report/handover edits only; no commit/push.

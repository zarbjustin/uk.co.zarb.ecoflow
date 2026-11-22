# Advanced coordination without whole-Homey access

## Proposed1.11.22 contract

EcoFlow remains responsible for its own devices,source ownership,counters and
SDK Homey Energy definitions. It requests only the existing geolocation permission.
No owner API token,loopback Web API reader or cross-app device catalog remains in
the production reader. No hidden OAuth delegation,stored owner token,generic proxy
or automatic companion installation replaces the removed permission.

## Existing devices and Flows

No device/Flow IDs,capabilities,arguments,counters,Insights,settings keys or pairing
identities are deleted. Stored source selections remain unchanged. The old
coordination picker/session and30-minute Flow monitor cannot start. Their WHEN
cards do not emit new observation events; their AND conditions fail closed with
unavailable readings,including inversion. Existing user THEN actions are not
executed by migration. Other original EcoFlow Flow actions are unchanged.

Retained card identities are NOT a promise of unchanged cross-app behavior. An
owner using those cards must review the replacement automation before installing
this candidate. In particular,do not automatically resume the separate household
reserve coordinator or restore its previous reserve policy. Native EcoFlow AI
and the currently disabled Homey execution remain under their existing owners.

## Separate owner automation boundary — design,not deployed

An explicitly configured HomeyScript or existing suitable owner automation can:

1. Read only owner-selected external device/capability IDs under that tool's own
   normal permissions. It must not hand a Homey owner token to the EcoFlow app.
2. Validate availability,unit,sign,scope and independent reading ages. Missing
   readings stay unknown. A capability timestamp is not a hardware measurement
   timestamp; expired or mismatched inputs block evaluation.
3. Optionally call this app's existing authenticated `/coordination-preview`
   endpoint with caller-supplied scalar readings. This endpoint owns its clock,
   supports the existing circuit-aware schemaVersion2,and returns advice only:
   controlsEnabled=false,commandWrites=0,contributesToEnergy=false. It cannot
   discover devices,start a monitor,claim Energy ownership or change a battery.
4. Keep review/observation separate from any owner THEN action. Native AI owns
   reserves unless the owner separately commissions a different controller.
   No battery command/Flow execution is included in this design or candidate.

The caller uses its supported app-to-app API authorisation for the EcoFlow API;
no new permission or credential is added to this app. Implementation,causal
freshness mapping,session lifetime,manual overrides and deployment of an owner
runner need separate review. This candidate does not claim a replacement
background monitor or migrated automation is already available.

Do not use a valueless dependency-only companion as an App Store loophole. The
core integration must function without an external automation installed.

## Dual CT Energy — important changed boundary

The previous implementation used the same broad reader for external-property
meter overlap checks as well as optional coordination. Removing only its
manifest permission would have broken Dual CT startup/pairing. The candidate
instead enumerates all packaged EcoFlow drivers through supported SDK getters.
Unknown/malformed/duplicate app-owned inventory still fails closed; active
EcoFlow cumulative meters still block adoption and conflicting runtime claims.
Excluded/downstream EcoFlow meters remain non-contributors.

The inventory declares scope=app_owned and externalInventoryVerified=false.
Completeness never claims a whole-Homey scan. New pairing still requires the
separate explicit externalOverlapReviewed acknowledgement,with clear EN/DE/NL
instructions to check external sources in Homey Energy. No other meter is changed.

**Automatic external-meter detection is removed.** Previously stored Energy
consent is retained; it records the earlier explicit external-overlap review,
not a fresh automatic external scan. Before candidate installation/rollout,
review existing external cumulative meter roles. Later changes to Tibber,P1,
Emporia or another external meter require a new owner review. This manual
responsibility is not equivalent to the former automatic guard and must be
accepted as part of the candidate review. It is not silently described as
unchanged or globally verified. No device conversion or counter rewrite occurs.

New owned inventory uses stable driver/data-derived private IDs only for local
overlap classification. Existing source binding,contract,timing,stored counters
and single-/three-phase accounting code are unchanged. Do not use new overlap
IDs as device IDs or migrate old stored bindings to them.

## Validation boundary

Synthetic tests exercise default SDK-only context,wrong/malformed inventories,
owned overlaps,duplicate own identities,external acknowledgement,retained
metadata,blocked advanced starts and desktop/mobile migration UI. These cannot
prove actual SDK override visibility or hardware preservation. Candidate review
must include SDK getEnergy/getSettings semantics and existing-device startup
readback on an explicitly approved exact archive. No source/test approval is a
permission change or installation on Justin's Homey Pro.

# STREAM 5000 unbound asynchronous control engine

This is source-only engineering, not an enabled AC5000 THEN handler, qualified
Homey storage backend, native writer, physical pilot or Test release. No app,
device, Flow-card or runtime import binds this engine. The existing disabled
reserve runtime and native EcoFlow AI ownership remain unchanged.

## Implemented ordering

`lib/stream5000ControlEngine.ts` wraps the accepted six-phase planner using
injected storage, native dispatch, current-context, clock and qualification
ports. It defaults disabled. Missing dispatch/qualification or disabled
enablement refuses mutations. Qualifier/verifier callbacks are trusted adapter
inputs, not native guarantees produced by this module.

An explicitly loaded storage record has an installation key, bounded namespace
incarnation, safe monotonic storage revision and complete journal. Undefined,
corrupt or wrong-installation data is not interpreted as virgin initialization.
The provider must independently prove authoritative initialization/retention;
an apparently empty object or different incarnation cannot prove old physical
obligations absent.

Every phase transition uses atomic CAS against both the loaded incarnation and
revision. Only an acknowledgement matching the exact intended journal,
incarnation and next revision advances committed truth. The draft and last
confirmed durable journal remain separate. Failed, ambiguous or mismatching
commits permanently hold that instance; it cannot dispatch its advanced draft,
retry, overwrite newer state or admit successors.

Forward/restoration intents and possible phases are committed separately.
No dispatch port is invoked before its possible-phase commit is acknowledged.
Current model/firmware/main/unit/scope/generation, authority, AI coordination,
companion configuration, reserve state and own-field freshness/revision are
rechecked after IO and immediately before invocation. The engine uses its
trusted clock, not a cached context object's old `now`. Native evidence must
match the current own-field epoch/revision; equal percentages are insufficient.

Dispatch acceptance does not advance terminal state. Terminal observations
and closure require the existing qualified native proof verifier. The terminal
frontier/removal of active ownership is durably committed before successors.
Busy state blocks overlapping or reentrant admission even when the draft
closure has already cleared its active claim.

## Withdrawal and recovery

One operation/IO chain is admitted per instance; there is no queue, retry wave,
automatic restoration, timer or reconnect. Sticky stop/hold is set before
aborting the owned signal. Waiting callers can reject even if a port ignores
abort. Late completions cannot revive that instance or invoke its next native
callback.

Abort is not remote cancellation. A CAS may commit after local rejection; a
native command already invoked may still execute. Snapshots report held and
storage uncertainty and retain last confirmed durable truth. Only fresh
qualified recovery reads the actual stored outcome; every recovered active
phase remains held without replay. A recovered restored-terminal operation can
close only through fresh qualified terminal closure and durable CAS.

Native numeric exhaustion is refused before knowingly impossible forward/
restoration dispatch. This is necessary headroom, not proof that native
revisions cannot jump or that restoration will succeed.

## What the ports must actually qualify

The store must supply private, atomic, durable expected-incarnation/revision
commits across every installation alias and writer, crash/reboot retention,
rollback/delete/recreate protection and authoritative initialization. Ordinary
Homey settings/store Promise APIs and public userdata are not such proof.
No filesystem, Homey settings or SDK storage implementation is supplied here.

The native dispatch port receives installation/incarnation/storage revision,
claim, local command reference, target, authority, companions, expected own-field
epoch/revision/value and field receipt. These are fences to verify, not tokens
that become native guarantees by being serialized.

**CAS is not perpetual dispatch authority.** The actual port must reject stale
issuance if another writer has advanced ownership, including after closure and
successor admission. It must qualify atomic ownership-to-execution fencing,
native identity/expiry/cancellation, causal application and terminal/no-late
semantics for the exact supported action/model/firmware/system or unit.
An ordinary final read or local mutex cannot establish that remote guarantee.
Local `reserve-N:*` strings are not globally unique native idempotency IDs.

Qualification must bind the actual immutable provider implementation, namespace,
deployment and native model, and remain current. Synthetic ports returning
`true`, fixture revision counters and fake CAS tests prove only bridge behavior.
They must never be registered as production qualification.

## Release path

This engine addresses the asynchronous source foundation, not EdNL's released
battery THEN requirement. Real backend/native qualification, an eligible
specifically approved pilot, qualified card integration, independent combined
candidate review, actual UI/preservation/physical and exact-runtime soak gates
remain before an approved Test release. The existing already-enabled
50 -> 51 -> 50 pilot preflight is false; no setting normalization is authorized.

Latest evidence packet:
`../work/output/then-engine-20261108T203738Z-9da5154f/`.
Read its final review, validation and receipt; source passes and synthetic
fixtures are not physical or published-channel acceptance.

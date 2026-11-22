# STREAM 5000 THEN phase-ledger foundation - 8 November 2026

This is an **unbound source-only planning contract**, not an enabled execution
engine, durable provider, native proof producer, physical pilot or released THEN
card. The existing default-disabled reserve runtime remains unchanged. Its V1
journal and held-restoration behavior are not silently migrated or cleared.

## Problem and bounded implementation

The existing cooperative V1 journal retains ownership but cannot distinguish
forward intent, possible forward dispatch, confirmed forward terminal evidence,
restoration intent, possible restoration dispatch and restored terminal evidence.
A deleted V1 claim leaves a used counter without a terminal frontier. Neither
fact establishes native execution closure.

`lib/stream5000ControlLedger.ts` plans a V2 journal with those six phases, one
active operation per ledger installation, monotonic claim/local command
references, claim-bound one-shot approvals, and a retained last terminal frontier. It is limited to the existing
separately approved, already-enabled 50 -> 51 -> 50 reserve pilot. The local
command references are **not documented native execution tokens**.
New planner approvals must include the exact next `claimId`; restoration uses
the active claim. A consumed claim's approval cannot authorize a later claim,
including after another completed operation or restart. An operation label
alone is not approval identity; future user-approval production remains unbound.

Every recovered nonterminal operation is held without replay, while its actual
phase remains available for investigation. Nonempty V1 journals preserve all
their obligations as unknown. Used-but-empty V1 journals remain held because
their terminal frontier is missing. Only a virgin V1 journal can become a virgin
V2 plan. There is no manual-reference recovery shortcut.

Exact target, firmware, routing, generation, authority revision, companion
snapshot, reserve switch and field-specific freshness qualify phase context.
Native epoch/revision evidence is separately required. ACK, a matching setting,
local receipt, heartbeat, local ID or evidence-reference string cannot produce
terminal closure. The proof callback is mandatory and absent by default; test
callbacks and qualification fixtures are synthetic assertions, not native proof.

Positive closure requires separately qualified evidence that both commands are
terminal, the restored own field remains current, and the native execution
frontier prevents late effects. It retains the completed frontier while clearing
the draft active claim. A held restored-terminal plan can be reconciled only
through the same fresh qualified barrier; other unknown phases remain held.
Generation/native-epoch changes require a separately qualified migration and
are deliberately not automatically admitted.
The completed frontier retains baseline/forward/restore native revisions so
recovery checks causal reachability rather than accepting a regressed summary.
The unchanged native epoch and two strict field-revision increases per completed
claim also impose the cumulative minimum `baselineRevision >= 2 * (claimId - 1)`.
An impossible exhausted-counter lineage is rejected, not normalized or wrapped.
New admission also requires two representable native revision increments.
Restoration cannot be planned/dispatched after a forward terminal revision at
the numeric maximum. A forward revision may jump unexpectedly; its actual
terminal observation is retained, but a knowingly unrepresentable restoration
is not dispatched. Existing possible effects remain held on recovery.
Every transition fences reentrant input getters/serialization and preserves a
hold issued anywhere between method entry and the draft mutation.

## Required integration barriers

This class has **no IO or timers** and does not commit anything. Its mutating
methods change an in-memory draft. A qualified orchestrator must durably CAS every
transition before dispatch, recheck live authority/field evidence after commit,
and durably commit closure before admitting a successor. Creating a new planner,
calling `close`, receiving a journal or awaiting an ordinary Homey setter is not
that barrier. Do not expose this planner as a Homey action handler.
The unbound `stream5000ControlEngine.ts` now implements asynchronous ordering and
withdrawal over synthetic/trusted port interfaces. It supplies no actual store,
native writer or runtime binding; see
`STREAM_5000_THEN_ASYNC_ENGINE_2026-11-08.md`.

The eventual provider must qualify atomic expected-revision commits, durability,
crash recovery, stale-writer rejection, shared installation/alias ownership,
ambiguous completion fences and initialization against the actual deployment.
The native proof producer must qualify causal own-field revisions, execution
identity and no-late terminal semantics for the actual model/firmware/scope,
including native-AI and competing-writer authority. Neither provider is supplied.
The existing runtime is intentionally not switched to V2 until those contracts
and the asynchronous integration/recovery tests are implemented and reviewed.

## Public evidence and release scope

The independent public-contract audit in
`../work/output/then-controls-20261108T183803Z-9da5154f/ASTRA_NATIVE_FIRST_PASS.md`
retrieved the official STREAM 5000 Series document via its public endpoint.
Reserve, five modes, feed-limit and socket command vocabulary exists. Model
firmware applicability, native-AI arbitration, causal/terminal/late-execution
guarantees and atomic durable Homey CAS remain unqualified. Reserve-off prose and
example disagree about sending zero; MQTT quota prose/example also differ in
flattened/nested representation. Do not resolve these ambiguities by guessing.

This foundation preserves existing app/cards/version/permissions and adds no
AC5000 battery THEN handler. Source tests cannot close the real eligible pilot,
UI, physical preservation, exact-runtime soak or Test publication gates.

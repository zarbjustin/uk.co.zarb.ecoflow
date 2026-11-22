# STREAM 5000 THEN binding withdrawal - 9 November 2026

## Confirmed defect

The unbound control engine checked binding qualification before its final live
context capture, but checked only local shutdown immediately before native port
invocation. If the context reader withdrew binding qualification without stopping
the engine, dispatch could still invoke that port. Separately, qualification
withdrawal during native IO or the final context capture could leave dispatch
reporting success and the engine unheld.

Binding qualification and live target/context qualification are independent.
A matching, fresh context does not establish that the binding remains qualified.
Two focused regressions failed against the unchanged source baseline
`6a999f012a6b6bb2a061a56aabb576d831ed7a3f` with missing expected rejection.
These are synthetic-port reproductions, not observations of installed hardware.

## Bounded correction

`Stream5000ControlEngine.dispatch()` now checks binding qualification immediately
before invoking the port and after the final post-IO context validation. Failure
uses the existing sticky shutdown/hold path. The durable possible-dispatch claim
is retained even if invocation was suppressed; uncertain submission is not
reclassified as cancellation, application, or permission to retry.

The regressions cover withdrawal at all three boundaries: final pre-invocation
context capture, asynchronous native IO, and final post-IO context capture.
They assert the retained durable phase, held state, suppression before invocation,
and no subsequent retry or restoration. An already invoked request remains an
unknown native outcome, not a local rollback.

## Source validation

On the current dirty canonical checkout under Node 22:

- All 77 control engine/ledger/contract/real SQLite tests pass.
- All 1,798 application tests, lint, structural release checks and pinned
  Homey CLI 4.5.3 verified validation pass.
- The current npm audit reports zero vulnerabilities.

These are dated local source observations. Exact-commit CI is a separate
checkpoint; it cannot cover unrelated uncommitted changes or qualify installation.

## Release boundary

No runtime binding, battery writer, card, version, setting or acceptance ledger
was enabled or changed. The provider and native proof producer remain unqualified.
The actual local Homey Pro THEN test milestone is not delivered by this fix.
Strong-control release still requires native/target/provider qualification,
reviewed card integration, exact approved candidate installation and physical
acceptance. A request-only product remains a separate unresolved scope decision.
No Flow, battery action, app restart, installation or Store publication ran.

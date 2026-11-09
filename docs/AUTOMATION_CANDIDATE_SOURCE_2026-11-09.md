# Automation candidate source consolidation - 9 November 2026

## What this source candidate contains

This diagnostic-branch candidate consolidates the previously accepted automation
reliability and monitoring changes in the canonical checkout:

- Bounded owned MQTT subscription recovery, transaction/queue/shutdown handling.
- Session-current SOC/mode events with silent first recovery and field-specific
  continuity, rather than events from failed or superseded observations.
- Independent Dual CT preview/detail expiry and core invalidation despite hung
  SDK writes, with retained bounded slots and late-completion correction.
- Qualified CT1 support in the existing grid-power condition, a STREAM 5000
  current-field/role guard, and a sustained CT1 monitoring trigger with dwell,
  hysteresis and cooldown.
- Strict selective reserve readback and configuration lifecycle handling,
  without enabling the separate default-disabled control foundations.

The existing original-STREAM THEN cards retain their IDs and device selectors.
The new Flow cards are monitoring WHEN/AND cards, not battery-control THEN cards.
CT2 does not become property Energy; dormant coordination remains dormant.
No new permissions, dependencies, version or release channels are introduced.

## Review and validation provenance

All 36 consolidated existing source/test/manifest/document files exactly match
their previously accepted independently reviewed source manifests. The prior
automation/follow-on and reserve-runtime reviews used Sol/Astra; this is hash
continuity, not a claim that those reviewers re-reviewed this publication.
A separate bounded integration review covers dependency closure and composition
with the subsequently published unbound THEN foundations.

The current canonical source passes all 1,798 tests, lint, structural release
checks and pinned Homey CLI 4.5.3 verified validation under Node 22. The current
npm audit reports zero vulnerabilities. Exact published-commit CI is tracked
separately from these local observations.

## What is not delivered

This is source consolidation, not Store Test publication or installation.
Version remains 1.11.24; matching an installed version is not runtime identity.
No new runtime archive, preservation baseline or physical acceptance is claimed.

The required local Homey Pro milestone is still a real, qualified, device-scoped
battery THEN card used through an approved Flow, not these monitoring recipes.
Native model/firmware/scope/AI and terminal guarantees, productive private
provider/issuer binding, actual card integration and exact approved local
installation/action/readback remain prerequisites. The strong-control THEN
ledger remains OPEN; request-only controls need a separate explicit product
decision and reviewed policy.

Full release additionally retains its existing Dual CT, monitoring and
exact-runtime physical/soak gates. A source push and green CI do not close them.
There was no installation, app/Homey restart, Flow execution, battery/settings/
Energy action, native-AI takeover, tester contact or Test/Live publication.

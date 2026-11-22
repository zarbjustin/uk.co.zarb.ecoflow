# Dual CT display settings — 1.11.7 review candidate

Source-only candidate on the diagnostic branch, 30 October 2026. Not installed
or published. Test 1.11.6/build 73, Live and installed Development remain separate.
The combined candidate now also includes the availability fix documented in
`DUAL_CT_AVAILABILITY_CANDIDATE.md`; its transport reconnect policy is unchanged.

## Per-device settings

| Setting | Choices | Default behaviour |
| --- | --- | --- |
| CT1 phase display | Default layout, Single phase, Three phase | Detailed monitor retains its existing three-phase view; Energy follows its paired accounting mode |
| CT2 display | Default layout, Hide CT2, Single phase, Three phase | Detailed monitor retains existing CT2 cards; Energy hides CT2 |
| Diagnostic details (detailed monitor) | Default, Show, Hide | Existing monitor layout is retained when all new settings are Default; an explicitly tailored layout hides diagnostics unless Show is selected |

These describe presentation, not verified wiring. No mode is inferred from zero
or missing phase readings. CT1 and CT2 are independent: a three-phase incomer may
have a single-phase secondary circuit. Selecting three-phase display on a
single-phase Energy device does not enable three-phase accounting. Changing the
paired accounting source still requires the separate source-specific consent and
binding review; it is never performed by these settings.

## Household examples

| Household / audience | Suggested display |
| --- | --- |
| Single-phase property, no second circuit | CT1 Single phase; CT2 Hide |
| Single-phase property with a secondary monitored circuit | CT1 Single phase; CT2 Single phase |
| Three-phase property with a single-phase secondary circuit | CT1 Three phase; CT2 Single phase |
| Three-phase property and three-phase inverter circuit | CT1 Three phase; CT2 Three phase |
| Existing advanced monitor user | Leave all defaults to retain the current layout, or explicitly Show diagnostics |

CT2 may include solar and battery exchange through a hybrid inverter, or a load
circuit. It is labelled neutrally and never added to property Energy or treated
as solar-only production. Circuit descriptions on the detailed monitor remain
labels; hiding CT2 does not disconnect a listener or modify a physical circuit.

## Device views and data semantics

The property Energy device retains its original power/imported/exported readings
and adds display-only phase capabilities, using the existing capability definitions.
A single-phase default view adds CT1 voltage and current; its total power is already
shown by the main Energy reading. A three-phase view adds phase power, voltage and
current for all three reported positions. Optional CT2 displays its same-payload
phase sum and the selected phase details. Missing/incomplete values stay unknown;
voltage/current are never summed or converted into inferred active watts.

These auxiliary values are latest received details with independent receipt
freshness of less than 90 seconds. CT2-only traffic cannot renew CT1 voltage or
current. Processing a delayed receipt does not extend its freshness. Core Energy
power retains its existing five-second live-delivery rules and qualified CT1 path.
No new subscription, cloud request, control, Energy contribution or vendor-counter
mapping is introduced. All unqualified vendor counters stay on the detailed
monitor's diagnostic display; they do not become Energy totals.

## Preservation design

- Existing capability IDs remain present. Visibility uses `uiComponent` options,
  with no `removeCapability`, capability replacement or reordered existing IDs.
- Hiding cards does not stop their normal value updates. Existing references and
  history are not deleted. Custom titles and other capability options are retained.
- Energy's exact checkpoint, source/account/grid binding, consent, accounting mode,
  native counter projection and Flow cards are untouched by display settings.
- New auxiliary cards retain the existing display-only privacy fences: no automatic
  Flow tags or Insights are enabled for unqualified phase data. Existing Energy
  history and Flow references remain as before.
- Detail capability setup runs after core Energy has started. Optional detail SDK
  failures do not revoke its subscription or counter writes. Stop/account changes
  cancel late display work and clear only auxiliary current values.
- Receipt time and processing time remain separate; no stale-field or CT2 cache
  can refresh an unrelated CT1 reading. Existing monitor calls retain their prior
  three-argument behaviour.

Homey's [capability documentation](https://apps.developer.homey.app/the-basics/devices/capabilities)
and [SDK option setter](https://apps-sdk-v3.developer.homey.app/Device.html#setCapabilityOptions)
provide the UI-component/option mechanism. Native per-device show/hide and client
refresh remain unverified until a separately approved installation. Reopen the
device view after saving display settings when performing that check.

## Candidate verification and review gates

Software regression coverage exercises independent phase layouts, legacy defaults,
reversible show/hide, custom-title preservation, no writes to core counters,
unchanged accounting/consent/binding/subscriptions, stale/delayed/CT2-only packets,
retained/duplicate rejection, optional SDK failures and cancellation on shutdown.
Existing single-phase and three-phase accounting tests still run unchanged.
Locked Node 22 install, all 1,279 tests, lint, release checks and pinned Homey CLI
4.5.3 verified validation pass. Full hardware readiness remains blocked.

After review, any Development installation needs fresh approval and a private
preservation baseline. Validate native mobile/desktop visibility, restart retention,
existing history/Flow references and settings round trips before considering Test.
No native hardware/UI pass is claimed from mocks, compilation or CI. Existing
three-phase hardware/reference/recovery/soak gates remain open.

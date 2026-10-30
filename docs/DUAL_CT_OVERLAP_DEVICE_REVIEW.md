# Named Dual CT overlap feedback — source review

30 October 2026. Local unversioned correction after Test 1.11.8/build 75.
No commit/push, archive rebuild, installation, channel change or tester message.

## Behaviour

If the existing fresh inventory check detects an included cumulative electricity
source on the same property grid, pairing remains blocked. The review page lists
the Homey names of the devices that triggered that check, next to the review
action. The wording says they are **being treated as** property grid meters;
it does not assert that their real wiring necessarily overlaps.

Example with synthetic data:

> These included devices are being treated as property grid meters. Review their
> Energy role before adding this meter. No settings were changed.
>
> - Existing property meter
> - Office circuit meter

This gives a specific next support question: identify whether the named entry is
an old grid-meter pairing, a downstream/third-party meter or another source whose
classification needs review. It does not justify deleting or excluding it blindly.
The existing field screenshot contains no blocker names, so this source work
does not yet identify the participant's actual conflicting device.

## Scope and preservation

- Optional display names are carried from the fresh Homey inventory; classification
  remains unchanged. Only matching-grid contributors with `contributes: true`
  appear. Excluded/downstream meters and foreign grids do not appear as blockers.
- The historical detailed Dual CT monitor uses custom capabilities and remains
  non-contributing. No automatic conversion, migration or re-pairing is added.
- A typed internal overlap failure carries at most five labels of 80 Unicode
  characters each and the total blocker count. Missing names use a translated
  fallback, and remaining devices are counted. Control/format characters and
  excess whitespace are normalised; labels are inserted with `textContent`.
- Names are returned only to the authenticated local pairing UI. No full device
  IDs, serials, bindings, raw exceptions or household measurements are returned
  with this blocked response. No logging, report upload or storage path is added.
- Display names are explicitly excluded from inventory-authority hashes and source
  bindings. Renaming an otherwise unchanged meter does not invalidate admission;
  changing its actual inclusion/source still does.
- A blocked response contains no review token, cannot enable confirmation and
  cannot commit credentials or add a device. Timed-out/cancelled/changed-selection
  responses remain fenced. Retrying or changing selection clears the old list.
- English, German and Dutch feedback is provided. No Energy inclusion, device,
  counter, history, Flow, firmware or source-qualification requirement is changed.

## Verification

All 1,291 tests pass, including seven new regressions for inventory labels/beta
monitor coexistence, bounded matching blockers, presentation-only renaming through
workflow and native Add, named blocks in both phase modes, mobile translated safe
rendering and malformed-response rejection. Existing accounting/counter suites
remain green. Lint, release checks, pinned Homey CLI 4.5.3 verified validation and
`git diff --check` pass. These are software checks, not native tester acceptance.

English/German mobile screenshots with synthetic names are retained privately
outside Git as review artifacts. The existing Test 1.11.8 archive remains unchanged.
This working tree is not a new 1.11.8 build; a later delivery needs an appropriate
version, exact source CI/archive review and explicit publication/installation scope.

## Homey/Tibber documentation cross-check — 30 October

The participant subsequently identified an existing Tibber Pulse configured as
his property Energy meter. This is a reported configuration, not independent API
access to his Homey. It explains the guard without implicating the old Dual CT
monitor or requiring its removal.

Homey's [Energy SDK documentation](https://apps.developer.homey.app/the-basics/devices/energy)
defines cumulative meters as highest-level home/power-group measurements, and
explains both Exclude from Energy and Tracks total home energy consumption.
[Tibber's own integration README](https://github.com/tibber/com.tibber.athom/blob/main/README.md)
records Pulse/Watty as cumulative Homey Energy devices. This app's refusal to add
another included source on the same property boundary is an intentional overlap
policy, not a Homey platform ban on multiple meters for distinct power groups.

[Homey's exclusion instructions](https://support.homey.app/hc/en-us/articles/19391114762268-Exclude-devices-from-Homey-Energy)
explicitly retain existing Energy reports while excluding future contributions.
A temporary trial can retain the Tibber device and original settings, explicitly
exclude it from Energy, then review/adopt one Dual CT property source. Do not delete,
re-pair, reset counters or copy Tibber totals into the new calculated Dual CT meter.
For reversal, exclude Dual CT before restoring Tibber's previous Energy inclusion.
The separate Tracks total home energy consumption switch makes a meter a regular
energy device rather than fully excluding it, so it is not an interchangeable
whole-source-exclusion instruction for two meters of the same physical boundary.

The [Web API device reference](https://athombv.github.io/node-homey-api/HomeyAPIV3Cloud.ManagerDevices.Device.html)
exposes energyObj and settings separately; the pinned local API schema also
provides settings readback/update as distinct operations. A local synthetic
cumulative-meter check confirms the existing guard blocks the included case,
and accepts energy_exclude=true or energy_cumulative_include=false as non-property
contributors. No live Homey setting or source transition was performed. Historical
Energy-report retention is documented; the actual trial's device/counter/Insights
preservation and reporting during its chosen interval still need readback.

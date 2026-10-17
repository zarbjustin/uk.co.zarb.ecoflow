# Selected-source coordination workspace

17 October 2026. Sprints A/B (the requested sprints 1/2), diagnostic branch only.
Local, uncommitted and unpublished. No physical or installed-host acceptance.

## What is available

The EN/DE/NL app-settings panel offers a separate, default-off read-only advisory
workspace. Opening settings or ticking consent does not enumerate devices. The
owner explicitly chooses **Choose Homey sources** to open a bounded session and
load a local metadata picker, then explicitly reads selected sources. There is
no background polling, cloud command, Flow action or Energy activation.

Separately approved Flow observation sprints now prepare a distinct explicit
30-minute monitor; see COORDINATION_FLOW_OBSERVATIONS.md. It has its own consent,
can continue when the page closes, and never starts from page-preview consent.
Statements about no background polling here refer to the page reader itself.

Required bindings are whole-installation grid power, external battery SOC and
power, and STREAM battery power. An optional branch is solar-only, hybrid
solar+battery, or load. Users review scope, signs, controller conflicts and other
sources; labels do not independently verify wiring or hardware semantics.
Power normalises W/kW to W: positive grid import, battery charging and branch
flow towards the house. SOC is percent. Unknown is not zero.

The picker accepts available numeric gettable W/kW/% capabilities, not a vendor
name. Fronius/BYD, Solis and P1 are potential sources only when their actual
Homey capabilities meet this contract; no vendor hardware has been commissioned
by these synthetic tests. SOC and power currently must belong to the same
external-battery Homey device; split-device integrations need a future explicit
asset contract. Duplicate source/capability pairs and using the external battery
itself as the STREAM source are rejected.

## Permission and read fence

The owner approved preparing `homey:manager:api` for cross-app reads. This is a
**broad platform permission**, not a platform-enforced read-only token. It is
prepared in the diagnostic manifest only; no installation/permission grant has
been performed. Homey verified validation warns that this permission requires
a more thorough App Store review and may extend review time. That is a future
release consideration, not approval or publication in this increment.
The application implementation limits the workspace to two
fixed local GET endpoints: device inventory and an encoded selected device ID.
No arbitrary route/host, write method, redirects, subscription or socket client
is exposed. Owner token/local URL come from the Homey SDK and remain internal to
the lazy reader. No additional package dependency is required.

The inventory HTTP response necessarily contains device objects; the adapter
projects only bounded picker metadata (IDs, driver, capability, unit, local
name/title). It does not return inventory telemetry, settings or device data to
the picker. Selected reads fetch the chosen device objects, then project only
the selected capabilities. This is not server-side field-scoped access.

Sessions expire after ten minutes; each operation has a ten-second deadline,
one in-flight operation and two seconds between reads. Selected unique devices
are fetched sequentially (maximum five), not re-enumerated. Opt-out, hidden/page
exit, app shutdown and expiry revoke/abort access. Pending-open cancellation and
late responses are guarded; an old tab cannot revoke a newer session.

## Timing, persistence and limits

Only capability `lastUpdated` is accepted, never request time. Missing, future,
invalid or at-least-60-second-old timestamps block the affected reading. The UI
clears snapshots when the earliest field expires, subtracting request duration
without relying on the browser/server clocks being synchronised. An unchanged
value may conservatively expire: `lastUpdated` is not proof of a hardware
measurement heartbeat. The response explicitly says measurement freshness is
unverified. Advisory dwell needs advancing observations, not repeated requests
for the same cached values.

Source/capability/unit/driver changes, source/site/session/provenance changes,
data gaps and unchecked confirmations reset/block advice. Editing bindings
clears all scope/controller confirmations. Saved settings contain only reviewed
binding metadata under `streamCoordinationBindingsV1`; consent, controller
confirmations, readings and advisory history are not saved. Selected IDs remain
private local configuration, not repository fixtures or new support exports.

The displayed result is waiting, blocked or observed surplus **for review**. It
is not permission to charge, proof of solar origin, electrical protection or a
controller. All command and Energy flags remain false. Existing drivers and
Energy declarations are unchanged. Source overlap, wiring, signs, meaningful
timestamp behaviour and actual multivendor capability contracts still require
owner-hardware acceptance before any separately approved control work.

## Checks and references

Regression coverage includes synthetic normalisation/negative traces, changed
devices/contracts, stale timestamps, session/revocation races, selected-ID-only
reads, fixed local HTTP routes, redirect rejection, and desktop/mobile settings
workflows with synthetic devices. These are not live Homey/hardware tests.

- [Homey Web API in apps](https://apps.developer.homey.app/advanced/web-api)
- [App settings bridge](https://apps.developer.homey.app/advanced/custom-views/app-settings)
- [Device API](https://athombv.github.io/node-homey-api/HomeyAPIV2.ManagerDevices.html)
- [Advisory schema and limits](STREAM_COORDINATION_PREVIEW.md)
- [Next hardware/control gates](STREAM_EXTERNAL_BATTERY_ROADMAP.md)

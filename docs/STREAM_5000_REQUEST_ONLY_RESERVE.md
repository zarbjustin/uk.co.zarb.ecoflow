# Experimental STREAM 5000 reserve request

9 November 2026: the owner explicitly selected request-only reserve THEN cards.
This is a distinct product scope, not a pass or relaxation of the existing
strong reserve-control ledger. Installation, Flow execution, battery/settings
actions and publication are not authorised by source-development approval.

## What the card does

**Request installation backup reserve (no confirmation)** is a real THEN handler,
not a dry run. It is available for paired STREAM 5000 Series Unit and existing
deprecated AC 5000 physical devices, never the Home Battery aggregate or original
STREAM. Each device defaults to opt-out. Explicitly enabling **Allow experimental
reserve requests** in its Advanced Settings permits requests; enabling that
setting alone sends nothing. Developer API keys/region are required separately
from the EcoFlow app sign-in used for monitoring.

Every invocation validates an integer 0-100%, reads the selected unit's main
device through the official API, selectively reads reported reserve/mode, then
independently rechecks main routing. Missing/unsupported/changed main routing rejects
without falling back to the selected address. Reserve must already be on and
reported mode must be `SELF_CONSUMPTION`. The card does not enable reserve or
change AI/mode, tasks, charge/discharge limits, sockets, feed-in or Energy.
The vendor range is request syntax, not a household safety recommendation.

It submits exactly one PUT containing only `bpBackupConfig.backupSoc` in the
documented 38/254 envelope. It uses the official main route because linked
installation effects must not be presented as unit-only control. Actual firmware
scope/effects still require hardware commissioning; do not assume every linked
unit is independently controlled.

Flow success means the API returned exact string `"0"`: **request accepted,
application not confirmed**. There is no optimistic capability update, automatic
retry, restoration, compensation, schedule or background controller. Existing
configuration tiles remain observations from monitoring, not command outcomes.
Check the native app independently. Matching readback is not causal proof or a
charging/discharging/pause guarantee.

## Concurrency, cancellation and remaining limits

Only one request may be in flight app-wide; concurrent requests reject rather
than queue, including two paired representatives of the same installation.
An active private house-reserve controller or incomplete lease blocks this card.
Identity, pairing, opt-in, availability and Developer credentials are rechecked
across preflight. Credential/controller setting changes, device opt-in changes,
device teardown and app shutdown abort pending local work. Whole-operation
deadline is 15 seconds; each HTTP attempt is bounded to five seconds.

Any failure after possible submission rejects as **uncertain**, never as applied
or remotely cancelled. Check EcoFlow before another request. There is no durable
cross-process issuer, native compare-and-set, command terminal/no-late guarantee,
automatic retry suppression across user-authored repeated Flow invocations, or
exclusion of native/external writers. Preflight reports are latest cloud reports,
not device measurement timestamps; routing/mode can race with another controller.
Do not use this experimental card in an unattended charge/pause controller.

The public contract source is the [official STREAM 5000 document](https://developer-eu.ecoflow.com/us/document/PP3?id=2115695633708867585),
revalidated 7 November 2026. Main lookup, selective quota reads and one-attempt
strict-response methods reuse the existing signed client. The private legacy
house-reserve MQTT bridge and strong unbound control engines are not reused.

## Local Homey Pro commissioning, not yet performed

1. Review the exact built candidate and obtain precise approval for one non-clean
   Development installation/app reload. Privately capture preservation baseline
   for devices/settings/Flows/Insights/counters/Energy. Do not install or activate
   anything as a side effect of building this source.
2. Read native model/firmware, linked scope, reserve and mode. Obtain a precise
   opt-in and one bounded reserve-action approval on the actual baseline. An off
   reserve or different mode is a stop, not permission to change native settings
   to manufacture an eligible pilot.
3. Configure the new THEN in a disabled isolated Flow, review the selected scope
   and requested percentage, then run only the approved action. Record API
   acceptance separately from independently observed native configuration and
   physical effects. Do not chain battery actions from accepted-request success.
4. Compare preservation and adjacent configuration. Restoration, if desired,
   is another precisely approved explicit action, never an automatic inverse.
   Record uncertainty and stop on unexpected scope/effects. Full release and
   subsequent exact-runtime soak remain separate from this first local test.

The card is a first response to [EdNL's IF/THEN request](https://community.homey.app/t/157399/95),
not fulfilment of cheap-period charge-now, minimum 700 W or idle, BYD priority,
normal pause/native return, exact wattage, or model-wide hardware acceptance.

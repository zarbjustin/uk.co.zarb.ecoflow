# Homey Energy completion and product presentation

29 October 2026. Diagnostic source work; no new deployment, Energy adoption,
exclusion change, hardware operation or publication is authorised by this record.

## Product presentation

Everyday settings now separate Developer API credentials from the EcoFlow app
account. Homey Energy setup has its own section; integration reports, packet
research, reporter checks and coordination tools are under a collapsed Support
and advanced diagnostics section. Opening sections does not start capture, make
EcoFlow requests, persist consent or enable accounting. Account removal is under
Manage stored account. Existing setting/action IDs, paired identities and legacy
consent semantics are preserved. New guidance is localised in English, German
and Dutch. Obsolete retired-Beta wording and release-history prose were removed
from customer settings/store description. Real preview/validation limitations
remain explicit; visual polish does not confer official EcoFlow endorsement.

Settings failures now display fixed messages instead of raw exceptions. Account
removal no longer instructs users to re-pair existing devices. Diagnostic 1.10.59 now adds an account Repair path without adding another device.
It verifies all existing app consumers before a confirmed, read-back credential
update; native desktop/mobile acceptance is still required before release.

## Energy roles reviewed

Compared source manifests and runtime capability handling against the current
[Homey Apps SDK Energy documentation](https://apps.developer.homey.app/the-basics/devices/energy).
Grid meters use cumulative import/export capabilities; battery Energy uses a
battery device and separate charged/discharged counters. Solar generation needs
its own solar-panel device and positive generation watts. Hardware combining
these functions requires separate Homey roles. Control capability support is a
separate feature, not authority to add battery controls here.

| Function | Current implementation | Remaining release work |
| --- | --- | --- |
| Original Smart Meter | Grid sensor with cumulative import/export capabilities | Validate intended electrical boundary and owner inclusion; retain counters/identity when moving it to a downstream role |
| Original STREAM Home Battery | One battery aggregate with signed watts and separate charged/discharged totals | Recheck selected installation, native direction/interval accuracy, original-family freeze recovery and long-use continuity on final candidate |
| Original physical STREAM units | Monitoring capabilities; no second battery Energy contribution | Preserve custom reading identities and keep independent unit/system scopes |
| Original solar and microinverter | Separate solar-panel roles | Verify source attribution and avoid including overlapping views of the same generation |
| STREAM 5000 physical units | Read-only monitoring without battery Energy contribution | Exact ES21/ES22 model, accessory, freshness and recovery acceptance |
| STREAM 5000 installation battery | Registered, separately gated battery aggregate | Native combined scope, charge/discharge kWh intervals, restart/rollback and exact-candidate soak; not currently paired on owner host |
| STREAM 5000 PV generation | Unit PV monitoring is separate from Energy generation | No qualified dedicated 5000 solar Energy path has been established. Existing Developer-API solar pairing is not proof of app-connected 5000 support; decide and validate explicit scope before claiming every Energy function complete |
| Dual CT CT1 property meter | Separate driver/pairing/inventory/subscription path wired in 1.10.59, hidden and runtime disabled | Qualified model/firmware/sign/timing provider; native pairing/Repair/accounting and overlap transition |
| Dual CT CT2 | Read-only preview only | Disconnected in owner topology. Do not infer production, another battery's power or whole-property contribution |

Widget capacity settings do not configure Homey Energy capacity. Native capacity
presentation, linked packs and reporting-scope evidence remain separate. A nominal
product label is not a usable-capacity measurement.

## Fresh read-only owner check

29 October, approximately 17:48 UTC: Homey reports running Development 1.10.58.
The original EcoFlow meter remains included as a cumulative whole-property meter,
despite its confirmed downstream office role. Home/Emporia and Octopus electricity
are excluded. Octopus gas inclusion is a separate fuel and must not be treated as
a competing electricity meter. Dual CT remains the non-Energy preview; the original
battery aggregate remains included and the microinverter is excluded. No settings
were changed. Full identities, source settings and readings remain private.

The final transition must explicitly review CT1 as the property incomer, change
the office meter's whole-property role, and preserve all device IDs, counters,
Insights and Flows. Do not remove the current source before a qualified replacement
is ready. Solar/battery overlap needs its own review of actual wiring and sources;
cloud spaces alone are insufficient.

## Qualification dependency

Our app client uses the device-list endpoint for discovery and exposes no
supported firmware readback method. The pinned upstream implementation's
[firmware extractor](https://github.com/shuette42/ecoflow-energy-ha/blob/cd82685d6e41b023de64d5f45045231629f0c2f8/custom_components/ecoflow_energy/ecoflow/firmware.py)
also reports that device lists omit firmware; quota revisions, where present, are
subsystem-specific and their packed interpretation is unconfirmed there. This is
research evidence, not an official vendor guarantee for Dual CT. Do not fill the
runtime firmware field from a native screenshot, a protocol version byte, a saved
user setting or an assumed model default. A trustworthy firmware source, or an
explicitly justified alternative contract design, is required before activation.
No firmware/timing gate was weakened during this cleanup.

## Completion order

1. Resolve firmware/sign/timing qualification for the new wired CT1 driver.
   Keep it hidden/default off and preserve the existing preview until qualified.
2. Establish 5000 solar Energy scope and implement/qualify the required source.
   Account Repair is implemented in 1.10.59; native acceptance remains required.
3. Review exact source/CI/package and separately approve any Development update.
4. Review property-source transition and native battery/meter tests with explicit
   bounds. Battery operations, pairing and Energy exclusion changes each need
   approval before execution.
5. Validate sign, zero, matched-window kWh, expiry/recovery, native persistence and
   rollback, desktop/mobile Energy rendering and at least 48 hours on the final
   candidate. Keep ES21/ES22 and unit/system evidence separate.
6. Review release scope and delivery. Mainline, Test and Live require their own
   authorisation; successful software checks do not imply publication or physical
   acceptance.

`release:full` combines Dual CT/STREAM 5000 ledgers and rejects disabled/hidden
Dual CT source admission. It is
not a check for every product feature, solar path, source integration, UX issue,
CI outcome or store delivery. All open dependencies above remain release work even
if those hardware ledgers are later accepted. Do not describe sprints 4–6 or all
Homey Energy integrations as complete from the cosmetic cleanup or software tests.

# EcoFlow for Homey Pro

Monitor **EcoFlow STREAM** systems and the original **EcoFlow Smart Meter** from Homey Pro. Original STREAM has guarded settings controls and Energy/Flow/Insights support. STREAM 5000 monitoring, mixed-generation trials and Dual CT Energy trials have distinct limits; product availability is not integration hardware acceptance.

> App ID `uk.co.zarb.ecoflow` · Homey SDK v3 · TypeScript

**Continuing development on another machine?** Start with
[the Codex handover](docs/CODEX_HANDOVER.md) and [current status](docs/STATUS.md).
The active diagnostic work is not on the default `master` branch; source,
installed Homey candidate and store releases are separate states.

## Features

### STREAM (Ultra / Pro / AC Pro / Max / Ultra X)
- **Home Battery device:** one per STREAM installation (main SN) — battery level & health, battery/solar/grid/home power, temperature, voltage, charge/discharge limits, backup reserve and operating mode. Appears in **Homey Energy** as home storage with charged/discharged meters.
- **Solar device:** a `solarpanel` device per system showing PV generation + cumulative solar energy.
- **Per-unit monitors:** each physical inverter/battery (Ultra X Left/Right, AC Pro 1.1–1.4) is available as its own telemetry device without contributing separately to Homey Energy.
- **AC sockets:** each AC outlet on AC Pro / Ultra X is its own **smart-plug device** (on/off + live power) — clearer than generic toggles.
- Solar, microinverter and socket freshness checks reject fields older than three minutes without their own accepted receipt. Live tiles are cleared to unknown on the next minute expiry tick when the SDK queue progresses, not at an exact three-minute deadline; blocked SDK work can delay clearing. Missing data is not zero or off. Socket action completion acknowledges the cloud request; later telemetry, not that acknowledgement, reports relay state.
- **Control:** settable charge/discharge limits, backup-reserve level (3–100%), operating mode (Self-powered / AI / Scheduled / Time-of-use), grid feed-in on/off, per-socket on/off.
- Original battery units use the explicit BK11/BK12/BK31/BK41/BK51/BK61 registry. The BK01 microinverter has its own monitoring driver; it is not a Home Battery. Unknown/new models are not admitted by marketing name.

Pair **STREAM Home Battery** for one aggregate device per main system serial. It is
the single source used by Homey Energy and the STREAM widgets, including one-unit installations.
Pair **STREAM Unit** only when you also want separate per-device telemetry; physical units
do not contribute to Homey Energy and do not contain reliable whole-installation totals.

### STREAM 5000 Series — separate monitoring and Energy pairing
The diagnostic source candidate offers **STREAM AC 5000 (ES22)** and **STREAM 5000 (ES21)** monitoring through EcoFlow's app connection using captured app protocols. This is separate from the official Developer API; an optional, narrow Developer-API fallback can supply system battery level, not missing power or configuration. **STREAM 5000 Series Unit** needs no Beta switch or Energy opt-in and contributes no battery Energy. **STREAM 5000 Home Battery** has a separate, default-off **Allow Home Battery (5000) Energy pairing** opt-in in the Homey integration settings; use it only once per already combined installation, checking for overlap. The retired Beta flag does not grant this new consent. Existing paired devices keep working when the new gate is off. Both roles use your EcoFlow app-account sign-in. Available PV/socket/configuration views are read-only and depend on received fields; no 5000 command is sent. Model/role hardware acceptance remains separate. Mixed-generation trials, Dual CT community trials and expansion/3000/Gateway admission retain their own restrictions. See [delivery/installed status](docs/STATUS.md), [current model scope](docs/STREAM_MODEL_COVERAGE.md), [connection details](docs/EXPERIMENTAL_STREAM_AC5000.md) and [architecture](docs/STREAM_5000_ARCHITECTURE.md).

The socket/configuration update includes battery-to-backup-socket discharge in
the installation's power and future energy totals. It adds read-only configuration
observations to **Show support report**: power limits, mode, reserve, SOC limits
and schedules. These are subscription-source observations with receipt age,
not verified whole-system limits or control readback. Existing devices and saved
counters are preserved; there is no need to delete or re-pair for this update.

### Smart Meter (CT_EF_01)
- Added as a **Homey Energy grid meter**. Native power always represents grid import/export. The device setting can also show a separate **Home load** reading when the linked STREAM installation supplies it; this is not a second CT channel.
- Subscribes to the meter's own Developer MQTT feed. Fresh direct grid power takes priority over linked-installation REST fallback. Phase readings are exposed only when the meter supplies them and clear when stale.
- Cumulative **imported/exported energy** remains derived from observed grid power. Native counter candidates are diagnostic evidence only, not adopted energy totals; unseen gaps are not filled.
- App settings provide a local meter-source/freshness summary when the integration report is refreshed. It distinguishes direct readings, installation fallback and missing/stale data. Keep one authoritative grid meter per connection; Home Battery has a separate battery-energy role.

### Three-phase Dual CT community Test trial

Version 1.11.6 adds an explicit new-device three-phase CT1 community trial on
model 421/firmware 1.0.0.41. Single phase remains the default and existing devices
keep their bindings/counters. CT2 is excluded from property Energy. Field validation
is ongoing; local feedback is available in the integration support report, with no
automatic upload. See [trial scope and feedback](docs/DUAL_CT_THREE_PHASE_COMMUNITY_TRIAL.md).

### Smart Meter Dual CT

Choose **Smart Meter Dual CT** for CT1 whole-property Homey Energy. Select single
phase or the explicit three-phase community trial during pairing. Advanced settings
show the **Paired Energy mode**; changing the phase display only changes visible
readings, never the accounting mode. Per-phase power, voltage and current and
optional CT2 readings are available on the same device.

CT2 can monitor another circuit, but is not added to property grid totals and is
not a separate Homey Energy solar/load contributor. A hybrid inverter can include
battery exchange; its output must not be labelled solar-only production.
Import/export totals are estimates from observed CT1 power, exclude unobserved
gaps, and do not copy historical meter totals. Native EcoFlow response-time claims
are not guarantees for this cloud integration. Three-phase field validation remains
open; see the community trial guide above.

The earlier detailed-monitor driver is hidden from new pairing. Existing devices,
capabilities, history and Flow references remain supported; this update does not
convert or remove them. There is no need to re-pair existing devices for the cleanup.

### Advanced cross-app coordination

The production candidate does not request whole-Homey API access. EcoFlow devices,
counters and Homey Energy remain in this app. Overlap checks use visible EcoFlow
meter roles. If the SDK cannot read Energy inclusion flags, review the other meter’s
**Homey Energy meter role** in Advanced Settings first. This declaration does not
change its Homey Energy inclusion or counters; review it again after Energy/wiring
changes. Unreviewed roles stay blocked. Review other apps’ meters in Homey Energy
yourself. The selected Dual CT does not need its own role review.

The former in-app cross-device picker and observation monitor cannot start in
this candidate. Saved source selections and the six existing observation Flow
card IDs are retained, but cross-app conditions fail closed and no new observation
triggers fire. Existing user THEN actions are not run. Advanced coordination
needs a separately authorised HomeyScript or owner automation; nothing is
installed or enabled automatically. The pure authenticated advisory preview
endpoint remains available without a reader or commands. See
[the migration design](docs/COORDINATION_EXTERNAL_RUNNER_DESIGN.md).

### Automation
- **Triggers:** solar/grid power changed, grid import/export started, grid import/export **rises above** a threshold, charging/discharging started, battery level crossed, operating mode changed, fault raised/cleared, device online/offline.
- **Conditions:** reported operating mode/feed-in permission, battery level, charging/export and solar power; charging while PV exceeds reported home load (not proof of exclusively solar charging); dated solar forecasts and current electricity price. Missing/expired inputs stop evaluation, including inversion.
- **Original STREAM actions:** operating mode, guarded reserve and charge/discharge SOC limits, feed-in permission, supported AC sockets, **Prepare for cheap import**, **Prepare for peak/export**, **Allow battery export (minimum reserve)** and **Set current electricity price**. These change settings, not guaranteed physical wattage; native limits/modes/schedules still apply. Existing IDs/argument contracts remain unchanged.
- **Solar forecast:** today's and tomorrow's expected yield from the local weather forecast ([Open-Meteo](https://open-meteo.com), keyless) at Homey's location, with a tunable calibration factor.
- **Tariff automation (provider-agnostic):** feed your current price from **any** tariff app (Octopus, Tibber, aWATTar, …) into the *Set electricity price* action and drive price/negative-price Flows — see [tariff recipes](docs/OCTOPUS_FLOWS.md).
- **Insights:** supported standard driver measurements are logged; Dual CT candidates and temporary coordination telemetry are excluded from new Insights/export paths.

### Dashboard widgets
Five distinct widgets (each with its own accurate preview), bound to a chosen STREAM system:
**Energy Flow**, **Today Balance**, **Battery Plan**, **Solar Forecast**, and **Energy
Recommendation**. Widget selectors only offer aggregate **STREAM Home Battery** devices. In that
device's settings, optionally enter the installed system capacity; Battery Plan then shows stored
and usable kWh and estimates time to empty while discharge is above 50 W. The estimate respects the
higher of backup reserve and discharge limit and applies the configurable discharge efficiency
(92% by default). Without capacity or active discharge, the widget clearly labels EcoFlow's
device-reported fallback. Energy Flow and Battery Plan support both Developer-API and STREAM 5000
app-connected Home Batteries; widgets that require history, solar forecasts or tariff controls
remain limited to installations that expose those capabilities. Regenerate the purpose-built,
text-free preview artwork with `npm run widgets:preview`; it is not a screenshot of the live HTML.

### Languages
English, **German** and **Dutch**.

### Under the hood
- Signed EcoFlow IoT Open Platform REST client (HMAC-SHA256, validated against the documented test vector), with bounded retry for transient blips.
- Shared **MQTT** connection for near-realtime updates, with REST polling where supported. Cadence varies with the model, source and EcoFlow service; a two-second update is not guaranteed.
- Developer telemetry retains at most 64 pending reports plus one running report. Overload drops whole new packets, exposes incomplete accounting and re-anchors power estimates; it does not merge sparse counter reports. Original native counter decreases hold their previous high watermark because reset and delayed data cannot currently be distinguished; genuine resets can undercount until that watermark is exceeded.
- **Troubleshooting / logs:** view the app's live log (incl. `[mqtt]` connection events) via *Homey Developer Tools → your app → Log*.
- **Local support report:** app Settings → **Show support report** provides installed
  versions, battery-driver registration and sanitised Energy accounting metadata,
  without credentials, device names or serials. See the [tester checklist](docs/TESTER_VALIDATION.md).

## Setup
1. Create an **Access Key** and **Secret Key** at [developer.ecoflow.com](https://developer.ecoflow.com) → *IoT Background*.
2. Add **STREAM Home Battery** for Homey Energy, system totals and widgets. Add
   **STREAM Unit** only for optional per-device monitoring. Enter the keys + region when prompted.
3. Manage credentials later under the app's **Settings** page.

> **STREAM 5000 setup:** choose **STREAM 5000 Series Unit** for monitoring without an opt-in. Aggregate Energy testing uses the separate **Home Battery (5000) Energy pairing** opt-in; pair one Home Battery per combined installation, not per unit. These use your EcoFlow app sign-in and are monitoring only—see [`docs/EXPERIMENTAL_STREAM_AC5000.md`](docs/EXPERIMENTAL_STREAM_AC5000.md). Source, direct installation and store availability are recorded separately in [`docs/STATUS.md`](docs/STATUS.md).

## Development
```sh
npm ci             # Node 22; committed lockfile
npm run build      # tsc
npm test           # tsc && node --test test/*.test.js
npm run lint
npm run release:check # identity, preview/permission and disabled Energy boundaries
npx --yes --package homey@4.5.3 homey app validate --level verified
npm run release:full  # expected to fail until exact-runtime hardware gates pass
```
Prepare Playwright Chromium as documented in CI. Validation does not authorise an
installation, restart, publication or live test; each needs separate owner approval.

## Release & publish
Read [`docs/STATUS.md`](docs/STATUS.md) and the [acceptance checklist](docs/RELEASE_CANDIDATE_CHECKLIST.md).
For diagnostic work keep mainline/Live unchanged. Commit/push and publication
require owner approval. After approval, check source CI, run the version workflow
on the authorised branch, validate the exact tag, then upload that tag. Verify
archive contents and the actual Test portal/listing separately. Do not submit
for certification, promote Live or install on a Homey without separate approval.
Never use a clean installation as an upgrade shortcut. Passing checks is not
physical acceptance; [control commissioning remains gated](docs/STREAM_CONTROL_CONTRACT_AUDIT.md).

## Notes & limitations
- This integration derives Smart Meter imported/exported energy locally from accepted grid-power readings. It does not adopt native counter candidates or fill unseen gaps; this is not a claim that every EcoFlow API/model lacks native kWh fields.
- Per-phase Smart Meter values are only available on standalone meters; a meter integrated into a STREAM system reports a single whole-home grid figure.
- Per-unit STREAM devices mainly expose their own grid feed and AC-output relays — full battery/solar/load aggregates are only reported on the system (main) device.
- Power values use EcoFlow's documented public-API units (STREAM reports Watts directly).
- **STREAM AC 5000 (ES22)** and **STREAM 5000 (ES21)** physical monitoring needs no opt-in; aggregate Energy pairing has separate default-off consent. Their captured app connection may change or stop working. The optional official Developer REST fallback is limited to system SOC and is not independent native-time telemetry or a power fallback. There is no 5000 control writer; read-only reported-mode/reserve conditions do not grant control. Hardware and linked-system scope still require commissioning; source availability does not establish store publication or installation.

## Credits
Field/command mappings cross-referenced against the community
[tolwi/hassio-ecoflow-cloud](https://github.com/tolwi/hassio-ecoflow-cloud) integration.
The STREAM AC 5000 (ES22) and STREAM 5000 (ES21) core adapters, app-auth flow and corroborated protobuf fields are adapted from the MIT-licensed
[shuette42/ecoflow-energy-ha](https://github.com/shuette42/ecoflow-energy-ha) — full attribution in
[`docs/EXPERIMENTAL_STREAM_AC5000.md`](docs/EXPERIMENTAL_STREAM_AC5000.md).
Not affiliated with EcoFlow.

# EcoFlow STREAM AC 5000 (ES22): monitoring-only app connection

> **Status: monitoring only. EcoFlow provides no supported public API for this model.**
> Everything in this document applies **only** to the `stream_ac5000` driver.
> The STREAM Ultra / Pro / AC / AC Pro / Max / Ultra X (BK-series) and the Smart
> Meter are unaffected and keep using the official EcoFlow Developer API.

## Why this exists

The STREAM AC 5000 (serial prefix `ES22`) is not exposed through EcoFlow's
public IoT Developer API. Every `quota` call for an ES22 returns API code
**1006**, so there is no supported way to read the device — with Developer keys
or otherwise. EcoFlow support was asked and provided no information or timeline.

The only working route is the app connection EcoFlow's own mobile app uses.
This app implements a **read-only** subset of it, behind its own driver, so
owners of an ES22 can at least monitor the unit from Homey.

## Relationship to the new 5 kWh STREAM family

EcoFlow's UK and German launch pages describe several products in the same new
generation. Marketing names are not sufficient evidence that they share a
serial family or protobuf layout, so only the model verified from live captures
is routed to this parser.

| Product | Officially published information | Protocol confidence |
| --- | --- | --- |
| STREAM AC 5000 | 5,024 Wh; 3,000 W AC input/output; no direct PV input | **Confirmed:** serial prefix `ES22`, separate parser implemented here |
| STREAM 5000 | 5,024 Wh; 3,000 W AC input/output; 4,000 W PV across four MPPT inputs | Product confirmed, but serial prefix and telemetry layout are unknown |
| STREAM Expansion Battery 5000 | 5,024 Wh expansion module for the new platform | Unknown whether it appears as an independent cloud device or as a nested pack under its host |
| STREAM Gateway | EcoFlow describes it as enabling later system expansion without rewiring | Product confirmed, but discovery identity, topics and telemetry are unknown |
| STREAM 3000 | Not listed as a distinct product on the referenced launch pages | The pages advertise 3,000 W output; STREAM Ultra X is listed separately at 3,084 Wh |

The existing BK-series remains a different protocol family: `BK01` STREAM
Micro, `BK11` Ultra, `BK31` AC Pro, `BK41` Max, `BK51` AC and `BK61` Ultra X.
Do not route a new product to either the BK parser or the ES22 parser based on
the word "STREAM" alone.

### Evidence needed for additional models

Support for the other new-generation products should proceed through explicit,
privacy-safe discovery rather than guessed aliases:

1. Capture the app-auth device-list entry: product name/type and a redacted
   serial prefix.
2. Subscribe to that device's app MQTT topics and record bounded command IDs
   and serial-redacted samples.
3. Compare values with the EcoFlow app before exposing Homey capabilities.
4. For an Expansion Battery, compare captures from the same host with and
   without the pack attached to determine whether it is nested or independent.
5. Keep all new models monitoring-only until their read path is verified.

The current build offers only `ES22` devices during STREAM AC 5000 pairing.
Unknown products are not subscribed or parsed yet; widening discovery is a
future diagnostic increment.

Official product references, accessed 9 August 2026:

* [EcoFlow UK STREAM Series](https://www.ecoflow.com/uk/stream-series-solar-battery-storage)
* [EcoFlow Germany STREAM Series](https://www.ecoflow.com/de/stream-series-balkonkraftwerk-mit-speicher)

## What it does

| Step | Endpoint / transport | Notes |
| --- | --- | --- |
| Sign in | `POST /auth/login` | Email + base64-encoded password, `scene: IOT_APP`, `userType: ECOFLOW`. Returns a token and a `userId`. |
| Discover devices | `GET /iot-service/user/device` | Bearer token. Only `ES22…` serials are offered for pairing. |
| Broker credentials | `GET /iot-auth/enterprise-development/user/certification` | Bearer token. The response body is base64 **AES-256-CFB** encrypted: key `SHA-256(token)`, constant IV `ojsajkqjwk1w2dfg`, PKCS#7 padding. |
| Telemetry | `wss://mqtt-e.ecoflow.com:8084/mqtt` | Subscribes to `/app/device/property/{sn}` and `/app/{userId}/{sn}/thing/property/get_reply`. Protobuf frames. |

Only the two approved EcoFlow API origins (`api.ecoflow.com`, `api-e.ecoflow.com`)
and EcoFlow's own MQTT brokers are ever contacted; the region you pick is tried
first and the other is used as a fallback — including when the first one rejects
the sign-in, because an account only exists in one region.

### Capabilities exposed

| Homey capability | Source |
| --- | --- |
| `measure_battery` | `254/39 f11.5`, refined by `f33.6`; V1.1.4.35 fallback from serial-keyed `f50.1.2`, then `f54.1.2` |
| `battery_soh` | `32/50 f15` (BMS heartbeat) |
| `measure_power` | Signed battery power derived from the `254/39 f12` flow matrix; **positive = charging** |
| `battery_charging_state` | Derived from the signed battery power (±5 W deadband) |
| `measure_power.load` | `254/39 f11.1` (half-watt units) |
| `measure_power.grid` | Signed meter net: `f15.3` (Tibber Pulse) or `f16.16` (EcoFlow P1); **positive = importing** |
| `measure_power.grid_import` / `.grid_export` | Derived from the flow-matrix edges, so both are non-negative |
| `measure_temperature` | `32/50 f9` (battery temperature) |

Fields the reference implementation flags as unverified or ambiguous
(`f12.8` solar→home, `f50.1.4`, `f38`/`f44`, the `254/40 f22` limits, `50/2`
thresholds) are deliberately **not** mapped. Nothing here is guessed.

Solar power, the SoC limits, pack voltage and BMS current are parsed but not yet
surfaced as capabilities — they are kept for a later increment once the read
path has been validated against live hardware.

### Diagnostics and live validation

Homey's submitted app diagnostic includes bounded ES22 parser-health entries:

* total frames, parsed/unparsed frames, received bytes and per-command counts;
* subscription state, usable-telemetry age and an allow-listed capability snapshot;
* the topic **kind** (`device_property` or `get_reply`), never the account ID;
* a rolling set of up to eight unparsed command/payload shapes, each sample capped at 192 bytes,
  refreshed no more than every 15 minutes with a hard 24-sample session budget;
* the ES22 serial is replaced before a sample is encoded, and credentials,
  tokens and MQTT certificates are never captured.

For a time-aligned comparison, enable **Capture next telemetry snapshot** in the
device settings immediately before taking EcoFlow and Homey screenshots. The
next `254/39` capability projection is written to the diagnostic log and the
switch resets automatically. No raw parsed payload is logged by this option.

## What it deliberately does **not** do

* **No control writes.** The MQTT session never publishes — not a `set`, not a
  `get`, not a keep-alive. Operating mode, charge/discharge limits, backup
  reserve and scheduled tasks are intentionally deferred until the read path is
  validated on real hardware. A wrong write to a 5 kWh battery is not a bug you
  want to find in production.
* **No REST polling.** An ES22 answers 1006, so polling would only consume the
  account's rate limit. All data arrives over MQTT.
* **No Flow cards, no Energy-dashboard totals.** Cumulative kWh counters are not
  derived in this increment.

## Availability behaviour

Because there is no REST fallback, availability is based purely on the age of
the last MQTT frame:

* a frame arrives → the device is available;
* no frame for longer than **Report offline after** (device setting, default 20
  minutes) → the device is shown as unavailable, **once** — the state is only
  applied on a transition, so a quiet device does not produce repeated
  notifications;
* on app start there is a 5-minute grace window before silence counts;
* if the app-auth session cannot be established at all, the device says so and
  retries every 5 minutes.

## Security and privacy implications

Read this before you use it.

* This flow needs your **EcoFlow account email and password** — not a Developer
  Access/Secret key. That is a full-access credential for your EcoFlow account.
* The email and password are stored in this app's Homey settings (encrypted at
  rest on the Homey) under `appAuthEmail` / `appAuthPassword`, and are only ever
  sent to EcoFlow's own API. They are **never** written to device data or store,
  never logged, and never included in an error message or diagnostic.
* Nothing is written until you actually add an ES22 device: the sign-in is held
  in memory for the duration of the pairing session, so cancelling it, finding no
  ES22 on the account, or a failure part-way through leaves no account stored. If
  the device is never created after all, the account is removed again.
* Tokens and the decrypted MQTT certificate live in memory only. The app logs a
  region and a connection state, never a credential.
* Using the app API is **not sanctioned by EcoFlow's terms**. EcoFlow may change
  or block it at any time, and may treat the sign-in as an unusual login. Use it
  knowingly, and prefer a dedicated/shared EcoFlow account if that matters to
  you.
* If you have two-factor authentication enabled on your EcoFlow account, this
  flow will not work.

## Setup

1. In Homey, add a device → **EcoFlow STREAM Series** → **STREAM AC 5000**.
2. Read the warning on the first pairing screen, then enter your **EcoFlow app**
   email address, password and region.
3. Pick your ES22 unit(s) from the list. Multiple ES22 units on one account are
   supported and share a single MQTT session. Your account is only saved once a
   unit is actually being added.

The account is asked for once. Adding a second ES22 later skips straight to the
device list.

## Removing it / re-pairing

* **Previously paired as a STREAM Home Battery:** older app versions could offer
  an ES22 through the wrong Developer-API driver. The device is now quarantined
  without polling and shows an unavailable message. Delete that device, then add
  it again using the **STREAM AC 5000** driver; the driver binding and required
  EcoFlow app credentials cannot be migrated safely.
* **Remove one unit:** delete the device in Homey. The MQTT subscription is
  released immediately, and once the last ES22 device is gone the shared MQTT
  session is closed too.
* **Remove the stored account:** deleting the **last** STREAM AC 5000 device
  automatically clears the stored EcoFlow email, password and region — nothing
  else uses them. You can also clear them at any time from the app's **Settings**
  page (*STREAM AC 5000* → *Remove stored EcoFlow account*). The
  Developer API keys used by the other drivers are separate and are not touched.
* **Re-pair after a password change:** delete the ES22 device(s) — which clears
  the stored account — then pair again. The app also re-logs in automatically
  whenever EcoFlow rejects a cached token.

Changing your EcoFlow password invalidates the stored one; the device will go
unavailable until you re-pair.

## Attribution

The app-auth flow, the AES-CFB certification decoding, the WSS ClientID scheme
and the ES22 protobuf field map are adapted from the MIT-licensed
**[shuette42/ecoflow-energy-ha](https://github.com/shuette42/ecoflow-energy-ha)**
Home Assistant integration — specifically `ecoflow/enhanced_auth.py`,
`ecoflow/app_api.py`, `ecoflow/clientid.py`, `ecoflow/cloud_mqtt.py` and
`ecoflow/parsers/stream_ac5000_proto.py`. That project derived the ES22 field
map from captures of live hardware; only the fields it verified are mapped here.
The TypeScript implementation in `lib/` is original work, but the protocol
knowledge is theirs.

```
MIT License

Copyright (c) shuette42 and the ecoflow-energy-ha contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Not affiliated with EcoFlow.

## Code map

| File | Purpose |
| --- | --- |
| `lib/EcoFlowAppAuthClient.ts` | App-auth HTTP client: login, device list, MQTT credentials, regional fallback, token refresh |
| `lib/appAuthCrypto.ts` | AES-256-CFB + PKCS#7 certification decoding |
| `lib/appDevices.ts` | App device-list normalization, ES22 detection and naming |
| `lib/appAuthPairing.ts` | Credential lifecycle (stored on device add only) and pairing handlers for the app connection |
| `lib/appMqttClientId.ts` | WSS ClientID generator (fresh per connect) |
| `lib/EcoFlowAppMqtt.ts` | Listen-only WSS MQTT session, multi-device, reconnect + credential refresh |
| `lib/streamAc5000Protocol.ts` | Frame header decoder + ES22 field map → typed telemetry |
| `lib/streamAc5000Mapping.ts` | Telemetry → Homey capability values |
| `lib/streamAc5000Diagnostics.ts` | Bounded, serial-redacted parser diagnostics for submitted Homey logs |
| `drivers/stream_ac5000/` | Driver, device, pairing view and assets |

Tests: `test/appAuthCrypto.test.js`, `test/appAuthClient.test.js`,
`test/appAuthPairing.test.js`, `test/appDevices.test.js`,
`test/streamAc5000Protocol.test.js`, `test/settingsPage.test.js`, plus the ES22
exclusion assertions in `test/devices.test.js` and `test/streamPairing.test.js`.
All network access is mocked; no real credential appears in any fixture.

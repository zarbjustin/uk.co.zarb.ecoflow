# Selected-source compatibility and access audit — 17 October 2026

Diagnostic-only hardening. No live household inventory, credentials, device
commands, Homey installation or new tester export was used. Public implementation
evidence is not a commissioned contract for Robert's or Ed's installed version.

## Source contracts

| Source | Public evidence reviewed | Consequence |
| --- | --- | --- |
| Fronius Storage / BYD via Homey | [Storage driver at cd18ac0](https://github.com/ThomasHoussin/com.thomashoussin.fronius/blob/cd18ac05b3f7885b60995bc7ad1ce3c3a051d756/drivers/storage/device.js), [manifest](https://github.com/ThomasHoussin/com.thomashoussin.fronius/blob/cd18ac05b3f7885b60995bc7ad1ce3c3a051d756/drivers/storage/driver.compose.json) | Standard SOC and power coexist on Storage. Power is voltage × current and is declared approximate; missing upstream fields may become zero. Default polling is 60 seconds. This is a possible metadata binding, not verified sensor freshness. |
| Fronius grid meter | [Meter driver at the same revision](https://github.com/ThomasHoussin/com.thomashoussin.fronius/blob/cd18ac05b3f7885b60995bc7ad1ce3c3a051d756/drivers/smartmeter/device.js) | Uses the meter's summed active power; do not substitute PowerFlow household load, inverter output or a single phase for grid exchange. Review actual wiring/sign and installed version. |
| Solis / SolisCloud | [Client maintainer's source/README](https://github.com/dalectric/ha-solis), [Homey battery sign convention](https://apps.developer.homey.app/the-basics/devices/energy#home-batteries) | Cloud cadence and sign conventions vary by implementation. This audit did not establish an exact released Solis Homey driver contract. No vendor auto-selection, driver allowlist, heartbeat exemption or control profile is added. |
| P1 | [Homey cumulative meter convention](https://apps.developer.homey.app/the-basics/devices/energy#cumulative-measuring-devices) | A suitable whole-installation grid capability may be selected, independently of Dual CT. A P1 product name alone does not prove capability scope, sign, update semantics or household-wide source authority. |

The Fronius revision above is source evidence, not proof that the Store or an
installed Homey runs it. Solis Home Assistant entities are not Homey capability
IDs. A Homey bridge may split SOC and battery power onto different devices; the
current binding schema deliberately rejects that until an explicit common-asset
contract is designed. Never substitute inverter output for battery-only power.

### Timing remains conservative

The sixty-second expiry and five-second bundle coherence limits are unchanged.
An unchanged SOC timestamp or a slow cloud poll can therefore block observations
even if a value looks plausible. A successful device GET does not prove a new
measurement. No provider-specific grace period, timestamp replacement, forced
refresh or invented heartbeat is introduced. Future heartbeat support requires
an authenticated provider contract and separate tests/approval, not a timeout
increase. A fresh upstream zero can still be upstream fallback: metadata cannot
prove it came from a physical sensor.

The picker now labels known Dual CT candidates as display-only; the same source
classifier enforces their Flow exclusion. Reading rows distinguish selected and
reported units and explicitly label timestamp age. Unknown units remain unknown.
Labels never grant verification or change values. No new source identities or
measurement metadata enter support exports.

## Permission and session lifecycle

[Homey's ManagerApi reference](https://apps-sdk-v3.developer.homey.app/ManagerApi.html#getOwnerApiToken)
documents a broad owner API session with a token that expires after two weeks
without use. That is separate from our ten-minute page session and thirty-minute
observation lease. Application opt-out cannot revoke the manifest permission or
promise platform-token revocation. The UI now says this explicitly.

The GET-only adapter rejects redirects and arbitrary routes, caps response bodies
at 4 MiB and closes on timeout/revocation. Close discards its token reference and
aborts HTTP reads. Cancelled token acquisition cannot continue to URL acquisition
or HTTP after it returns. The SDK token request itself has no cancellation
contract we can enforce: late credentials are discarded, not used or persisted.
No revocation endpoint is guessed, no global Homey session is deleted, and no
token is written to logs, settings, reports or Git. Explicit retries can create a
new platform session; no automatic retry loop is added to the page reader.

API permission denial, malformed/oversized responses, closed readers, revoked
sessions and changed units are regression-tested. Desktop/mobile retry tests use
the real backend workspace and a synthetic Homey bridge, not installed-host
acceptance. Ordinary source reads cannot validate Fronius zero substitution or
Solis physical direction. Those remain commissioning items, not tester requests.

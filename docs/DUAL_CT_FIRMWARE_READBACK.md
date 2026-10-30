# Dual CT read-only firmware identification — 30 October 2026

## Outcome

A working owned-source firmware lookup was found in the native EcoFlow app and
verified read-only. The missing-reader engineering dependency is resolved locally;
waiting for vendor correspondence is no longer necessary solely to obtain this
metadata. This does not qualify CT1 measurement timing, register an Energy contract,
activate the hidden driver, or pass the physical/release acceptance ledger.

## Provenance and request contract

The installed native app is 6.17.5 (build 88). Its RNResource.bundle/DualCt.bundle
contains the GET used for upgrade information and separately identifies a PUT
that reports a hardware-read version to the cloud. No proprietary bundle, raw
response, device identity, session or extracted source is copied into this repo.

Read only:

- GET /iot-service/device/latestPackInfo
- Query: selected owned meter sn, supportSelfRD=1.
- Headers: the authenticated session's Authorization, lang=en-us, version=6.17.5.
- Current-package field: cpackInfo.version. Never use latestPackInfo.version,
  wifiPack, a subsystem module revision, protocol byte or assumed default.

The headerless metadata GET returned 400. With native lang/version headers it
returned a same-SN, productType 421, online current-package record reporting
1.0.0.41, matching the earlier native firmware screen. Two guarded fresh GETs
and the actual default source-context lookup independently succeeded. Only the
Homey inventory reader was adapted to the private CLI environment; firmware was
not injected. No Energy session or device was created. The context found a complete
inventory with no included cumulative electricity/property contributor.

Other native routes were classified before use. GET currentVersion endpoints and
wifiVersion returned 405; they were not retried as mutations. The native bundle
shows /iot-ota/device/currentVersion is a version-report PUT, not a version-read
API. upgradeStatus GET works but returns no firmware. No report/update/upgrade
write, firmware download or hardware command was sent.

## Source changes and rejection rules

EcoFlowAppAuthClient.getDualCtCurrentFirmware performs the bounded native metadata
GET against the authenticated approved origin. Normal DualCtHomeyEnergyContext
uses it after owned model-421 discovery; the previous synthetic firmware-reader
injection remains solely an internal test seam.

The pure parser requires exact requested SN, numeric model 421, online=1, a valid
four-byte dotted current-pack version, isUpgrading=false, orderUpgradeStatus=0,
valid nonempty subsystem revision metadata, and no loader/ambiguous state. Missing,
malformed, offered-only, wrong-device, offline, upgrading and unknown-state
responses fail closed. A later failed lookup invalidates source/inventory instead
of retaining earlier eligibility. No arbitrary customer field can supply firmware.

The compatibility header is pinned to the observed native version. Future API
incompatibility must stop source admission rather than trigger guessed fallbacks.
No general-purpose arbitrary endpoint caller was added to the app.

## Important provenance limit

cpackInfo is cloud current-package metadata. The native app has a separate version-
report PUT. There is no hardware report timestamp in the observed GET response;
hardwareReportedAt is explicitly null. API receipt time is not proof of a recent
physical query, and opening an app page may refresh cloud metadata. No hardware
query/report was forced during this investigation.

This reader can provide the recorded firmware identity for the next source review,
but cannot by itself prove cache/upgrade behavior or measurement freshness. Native
comparison, version-change/recovery behavior and CT1 frame timing remain acceptance
work. Keep the production resolver empty and runtime disabled until the remaining
model/encoding/sign/timing contract is evidenced. No ledger gate is marked passed.

## Validation and scope

All 1185 tests pass, including seven new firmware/context regressions. They cover
current-versus-offered versions, wrong identity/model, offline/upgrade/loader states,
invalid selectors with no network access, metadata errors, fresh GET requests,
required headers, real-context default wiring, and invalidation after reader loss.
Locked Node 22 install, lint, release:check, pinned Homey 4.5.3 verified validation
and diff checks pass. Exact CI/archive delivery remains separate.

No installation, version bump, restart/reconnect, settings/Flow operation, pairing,
Energy adoption, firmware update, commit/push or Mainline/Test/Live publication.
The prior local UI cleanup and unrelated validation documentation are preserved.
Installed Development remains 1.10.62. Private evidence and native app provenance
stay outside Git.

## Next bounded output

Use this metadata reader with the existing read-only CT1 telemetry/independent
property-meter observations to finish sign/encoding and receipt-versus-measurement
qualification. Prepare the exact normal Energy candidate, then present a single
installation/adoption review with preservation checks and rollback/stop procedure.
No installation should be requested merely to prove this metadata GET: the local
reader and source context have already been tested against the real account.
After approved adoption, physical accounting/recovery and the final 48-hour soak
remain necessary before release. No new vendor request or repetitive tester capture
is needed for the firmware-read question.

Final private readback at 01:11:18 UTC preserves all 13 EcoFlow definitions/settings,
all Energy configuration, 1201 Insights identities and eight nondecreasing counters.
The earlier 99 Flow definitions remain unchanged; one additional Advanced Flow is
present (100 total). This is baseline drift, not an equal Flow-count preservation
claim. Its author is not established and it was not modified or executed here.

Uninstalled local runtime fingerprint: `4ca91f41c87b44ab67d4bd99dd7ea17907422a99e229a3db8e6819e10b57c26f`.

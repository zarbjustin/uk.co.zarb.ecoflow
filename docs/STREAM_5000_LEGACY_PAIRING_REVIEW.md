# STREAM 5000 legacy pairing investigation — 1 November 2026

## Evidence and limits

The latest public report describes blank AC 5000 telemetry on Test 1.11.19.
The corresponding Homey diagnostic email instead identifies runtime 1.10.3,
Homey Pro Early 2023 / firmware 13.5.3, and links to build 18. Startup logs
show an ES22 under original `stream` and `stream_unit` drivers; the later
startup entries show the original unit driver. These independent indicators
support a legacy-runtime/device-path explanation. They do not prove the
user's current installed version or account selection after the report.
No actual ES22 measurements or current dedicated-driver snapshot were provided.
Private identifiers and raw logs are deliberately excluded from this record.

## Source audit

Current `collectStreamUnits` excludes ES21/ES22 before quota/main probing and
is shared by the original aggregate/unit pairing paths. `BaseEcoFlowDevice`
quarantines existing ES21/ES22 pairings before credentials, lifecycle work,
polling and subscriptions. Dedicated 5000 pairing uses app-auth discovery and
model-specific adapters. Existing tests cover serial admission, both models,
quarantine and blocked writes. No new telemetry defect in 1.11.19 is established.

Added a regression exercising BOTH actual legacy device classes on upgrade:
wrong-driver unavailability without settings/store/capability/counter mutations,
network startup, timers or lifecycle work. Existing identities and history must
remain in place. No automatic driver conversion or cross-device counter copying.
This is preservation evidence from an offline test, not successful ES22 field data.

## Proposed next field step

Confirm the installed app version on the exact Homey and the paired device type.
If still on Live, arrange an in-place Test update at a suitable time, preserving
existing devices. After update, read the existing device's warning and one app
support report. If it remains a legacy ES22 pairing, review adding a separate
STREAM 5000 Series Unit monitor through the EcoFlow app connection. Keep old
items until Flows/history have been reviewed; never promise cross-driver identity
or Insights migration. A physical unit monitor does not add a household Energy
contributor. Aggregate Energy is a separate reviewed operation.
If version 1.11.19 and a dedicated 5000 driver are verified but empty, investigate
app authentication, model resolution, transport delivery, decoder outcomes and
field freshness using the existing bounded support report before another change.

## Reply — posted and verified 1 November 2026

Permanent public reply: https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/85

Hi Ed,

Thanks, I've reviewed your diagnostic report. There is a version mismatch worth
checking first: your message says 1.11.19, but the report itself identifies 1.10.3,
and its logs show the AC 5000 using the older STREAM device types.

Could you check the installed EcoFlow app version in Homey's app settings on your
Homey Pro 2023, and tell me the device type shown at the bottom of the battery's
settings page? The version on the App Store page can be different from the one
currently installed. No need to remove, Repair or re-pair anything, or change
MQTT or battery settings.

If the installed app still shows 1.10.3, please let me know before making further
changes. I'll guide you through the Test update and the correct AC 5000 path
while keeping your existing devices, history and Flows in place. If it already
shows 1.11.19, please send one integration support report from the app settings,
after reviewing it, so I can check which driver and connection are actually in use.
Please send that report privately rather than posting household diagnostics here.

Thanks,
JZ

## Status

Source investigation and preservation regression prepared. Field resolution is
pending the installed-version/device-type confirmation. No runtime change,
publication, installation, pairing or Energy activation. The reviewed reply was
subsequently posted with owner authorization; field confirmation remains pending.

Validation: Node 22 committed-lockfile npm ci, all 1,365 tests, lint, release:check,
git diff --check and pinned Homey CLI 4.5.3 verified validation passed.
Runtime fingerprint remains unchanged; no new field acceptance is claimed.

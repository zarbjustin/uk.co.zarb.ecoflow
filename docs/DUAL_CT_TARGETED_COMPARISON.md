# Dual CT targeted comparison candidate — 31 October 2026

Version 1.11.19 diagnostic candidate on the diagnostic branch.
Owner approved Test publication and tester instructions; activation pending verification.

## Purpose and scope

Resolve whether sparse target messages use legacy 21, display 39, get replies,
JSON or malformed envelopes, and distinguish field presence from accepted readings.
The same 21-only decoder, five-second Energy rules, source binding and counters remain
in force. No new socket, subscription, discovery, publisher, request or timer is added.

Incoming metadata is retained locally in memory only: at most 32 consecutive groups
within 15 minutes. Repeated shapes coalesce with counts and min/max receipt gaps.
Reports disclose evicted groups; counts saturate at 65535. Clock reversal clears
history. No raw payload, measured value, credentials, topic, serial or absolute
receipt timestamp is exported. Only fixed topic classes, command IDs, encoding
classes and the presence of CT1 fields 515/962/963/772 are recorded. A second
allowlist reconstructs the export, including nested properties.

Preview outcome packet_accepted is the monitor result; delivery_eligible in the
trial means only the delivery guard passed. Final source/decoder/accounting results
remain in community feedback. Neither label is hardware accuracy proof. Inter-message
gaps are not measurement intervals. Command 39 field presence uses candidate field
IDs only; it does NOT qualify that schema or admit that packet to Energy.
Outgoing requests, native transport selection, own-command echoes and causal links
are not verified by this collector. No outgoing subscription was added.

## Single-report workflow

An additional comparison button in app settings records three user-labelled phases
through the existing GET /support-snapshot endpoint. Baseline, screen-open and
screen-closed snapshots are bundled into one report. No auto-upload or native-app
operation. Settings-page navigation clears the in-memory comparison; keep it open
in a browser while using the native EcoFlow app separately. API failure does not
advance the phase; late callbacks cannot overwrite a newer operation. A changed app
version, reversed clock, completed previous comparison or >15-minute collection
starts a new baseline. Phase timings are local elapsed times, not verified actions.

## Tester draft — send only after the new Test candidate is published

Hi Robert,

I've added a more focused comparison so we can see which messages your meter is
sending, including the newer message type, and whether opening EcoFlow changes the
flow of readings. It keeps the message details we need without including your
power readings, serial numbers or login details.

Once I've confirmed the new Test version is available, please update when convenient.
The update briefly restarts the app. Keep both existing meters and all settings as
they are — no removal, re-pairing, Repair or Energy changes.

Please keep the Homey EcoFlow app's settings page open in a browser throughout:

1. Leave the native EcoFlow meter detail screen closed for two minutes, then click
   Record comparison baseline in the Homey app settings.
2. Open the Dual CT meter detail screen in the native EcoFlow app once. Wait two
   minutes, then click Record screen-open result in Homey settings.
3. Close the native meter detail screen, wait five minutes, then click Finish comparison.
4. Click Copy integration support report, review it, and send that one report here.

Opening the native meter screen may ask the meter to upload data automatically;
our Homey comparison buttons only read local diagnostics. Please don't change any
settings or refresh/reopen the meter repeatedly. If you see an unexpected change,
stop and tell me what happened rather than trying to restore or reconnect it.

Please also tell me your EcoFlow app version, whether it showed fresh readings
throughout, and whether it indicated Bluetooth or cloud connectivity (if visible).
If you can't keep the Homey settings page open while using EcoFlow, let me know
before starting and I'll give you the separate-report steps instead.

This should let us decide the next fix from one useful comparison. If anything is
still missing, I'll ask for the specific item rather than another broad capture.

Thanks,
JZ

## Decision after receipt

- 39 rejected with candidate CT1 fields: review the exact schema/encoding; prepare
  synthetic decoder tests. Do not widen acceptance based on field presence alone.
- Only isolated 21 despite healthy shared traffic: request vendor-supported cadence
  and upload semantics, or propose a separately approved native request capture.
- No valid CT1 fields in either type: request one bounded redacted envelope only if
  needed to resolve schema; obtain explicit consent and a secure transfer route.
- Regular valid packets but stale availability: investigate local processing with
  this timeline; no request for more hardware captures until that audit is complete.
- Results differ open versus closed: association only, not proof of the command or
  its persistence. Establish transport and request identity before automation.

No automated escalation to raw capture, outgoing subscriptions, settings changes,
new request, device restart, pairing or counter rewrite is permitted by this workflow.

## Local validation

Local validation: committed-lockfile npm ci, all 1,364 tests, lint, release:check,
git diff --check and pinned Homey CLI 4.5.3 verified validation passed. Hardware
acceptance gates remain pending; no new remote CI or field result is claimed.

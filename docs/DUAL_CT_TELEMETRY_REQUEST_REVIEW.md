# Dual CT telemetry request review — 31 October 2026

Status: static trace complete to the native bridge boundary; NOT approved or
qualified for hardware execution. No command sent or runtime implementation added.

## Evidence and correction

Inspected installed EcoFlow 6.17.5 build 88 as static data. Native source and raw
captures remain private; no extracted vendor implementation is copied here.
DualCt.bundle SHA256: 3e72e19895a4ece9a9f237d89c23687dfef71317862f53eb86d133c5833be26c
common.bundle SHA256: e7fa32160c2d06d533ddbdf0f8f09fd9e3f6bbcdbb5db220bb7b745e02daecf9

The online hook calls the Dual CT command sender with only
activeDisplayPropertyFullUpload=true. It encodes ConfigWrite, bool field 71.
The shared sender passes cmdSet 254, cmdId 17, dst 2, ddst 1, protocol V3,
needAck false, timeout 6000 ms and lockMs 0 to the selected device session.
The session defaults actionId to 0, sets source/destination serial to the selected
meter and leaves systemNo empty for this device-scoped path. It invokes
EFSmartDeviceModule.sendMsg via the native bridge.

A synthetic bridge-level description (NOT a MQTT frame or executable request):

    deviceSn: <selected owned Dual CT>
    systemNo: empty
    commandJson.params:
      srcSn / destSn: <same selected meter>
      dst: 2; ddst: 1; cmdSet: 254; cmdId: 17
      actionId: 0; protocolVersion: V3
      payload: bool field 71 = true, with all other fields absent
    needAck: false; timeout: 6000 ms

The JavaScript does not establish the selected physical transport, MQTT topic,
outer header, encryption, sequence or retry behaviour inside the native module.
Do not transplant STREAM 5000 envelope values or infer these from the GET helper.
A log string labels V4, but the actual call forwards the explicit V3 argument;
log wording must not override executable argument flow.

No periodic timer is present in the inspected online hook. It may run again on
status or component lifecycle changes. This does not establish firmware persistence,
a single snapshot, cancellation semantics or a continuous upload interval.
The UI wrapper returns the native result, and invokes a success predicate without
using its return value. This cannot prove device acknowledgement or measurement
receipt; needAck is explicitly false on this path.

Correction to the earlier narrow command-ID inference: the selected Dual CT hook
registers legacy 21 as a custom decode path AND inherits the shared 39 display path.
Legacy 21 decodes DisplayPropertyUpload; 39 can consume JSON or the shared protobuf
decoder using the supplied schema. The Homey candidate currently admits only 254/21.
This identifies a compatibility question, not a confirmed cause: the field report
contains no command-ID breakdown or raw rejected envelope. Do not simply admit 39,
copy default-filled values, or equate a cached/native callback with fresh MQTT power.

## Concrete next validation proposal

Preferred next experiment is an observation of normal native app use, not a custom
command. It still needs approval because opening the meter page can transmit the
above command automatically. Do not describe this as purely read-only hardware work.

1. Choose one owned model-421 meter; record actual firmware, app/runtime identity,
   current settings and existing counters. For the owner installation, preserve the
   working single-phase Energy source. Robert's installation remains a distinct scope.
2. Use an already available bounded listener if it can observe the necessary native
   request and replies. First verify the capture tool's topic coverage and privacy;
   do not claim the current small support summary captures outgoing wire envelopes.
   Any extra subscription/capture capability must be specified before approval.
3. Proposed observation window: two minutes baseline with native meter detail closed,
   then open the meter detail once, observe for two minutes, close the detail, and
   observe another five minutes. No refresh taps, settings edits, relinking, restart,
   forced reconnect or deliberate power changes. No automatic retry.
4. Record relative command/receipt times, command family, selected transport, matched
   response and CT1 inter-arrival times. Keep raw bytes/IDs locally private; share only
   approved redacted findings. Separate cache replies, own echoes, acknowledgements,
   legacy 21 and 39 uploads. Other-device traffic is not target delivery evidence.
5. Stop interaction on unexpected settings/status changes; preserve evidence and
   report. Closing the page is not a proven cancellation or rollback. Do not send an
   inverse flag, restoration command or guessed stop operation.
6. Success establishes only the observed native-request-to-upload relationship.
   Repeated fresh intervals after closing the page are necessary to investigate a
   sustained feed; a one-off response is not enough for Energy accuracy or release.

This is a review protocol, not an execution-ready approval request. Missing before
execution: selected meter/operator, exact capture mechanism, transport visibility,
private evidence destination and expected setting readback. If these cannot be
established safely, obtain vendor clarification first.

## Vendor clarification draft

Hello,

We have narrowed down the intermittent Smart Meter Dual CT reporting in our Homey
integration. The shared MQTT connection remains active and its subscriptions are
acknowledged, but the meter can deliver only isolated CT1 uploads. We preserve the
existing counters and stop integrating power across missing intervals.

Could you confirm the supported telemetry contract for product 421, firmware
1.0.0.41, particularly:

- How should a third-party integration request an initial full report and maintain
  continuous CT1/CT2 reporting without the EcoFlow meter screen remaining open?
- Is activeDisplayPropertyFullUpload in ConfigWrite 254/17 a transient snapshot
  request, or does it change persistent reporting state? Does it require renewal,
  and is any cancellation/restoration needed?
- What is the supported cloud request envelope/topic and response correlation?
  We do not want to infer a cloud command from the native app's device bridge.
- Are display uploads 254/21 and 254/39 both used for this model/firmware? What
  schemas, encoding and full-versus-incremental semantics apply to each?
- What reporting cadence and measurement timestamps are guaranteed? Are there
  authoritative CT1 import/export cumulative counters, including units and reset
  semantics, suitable for reconciling gaps?

We can provide a minimal redacted diagnostic summary if helpful. We have not sent
an experimental configuration command or changed the meter's reporting periods.

Thanks,
JZ

Draft only. No email or community message has been sent.

# CT1 Energy candidate admission and validation — 30 October 2026

## Candidate admission is separate from release acceptance

1.11.0 prepares normal, explicitly adopted CT1 property Energy pairing for model
421 / cloud current-package firmware 1.0.0.41 / single-phase CT1. No automatic
conversion of the existing detailed monitor, and no accounting until that new
Energy device is explicitly added. CT2 is excluded. Unknown firmware, other models,
missing phases or nonzero phase 2/3 are outside this candidate admission.

The profile is developer-owned source, not a customer checkbox or annotation.
Its liveFreshnessValidated flag denotes the **guarded receipt-estimation policy**
reviewed against a private observed stream and synthetic tests. It does not assert
a device measurement timestamp, calibrated accuracy or completed native acceptance.
The full-release command still requires every exact-candidate hardware gate.
No hardware gate is promoted by source admission or a green software check.

This replaces the earlier temporary engineering invariant that pairing/resolution
must always be disabled. The release-boundary checker instead pins the exact
profile, firmware, CT1 bank, W/sign/encoding, single-phase restriction and 5000 ms
limit; it still rejects preview Energy, new Flow actions, public routes, expanded
permissions, arbitrary profile drift and automatic preview conversion. Full-release
hardware readiness remains fail-closed. This is a candidate for owner-approved local
validation, not a declaration that store Test or production is released.

## Evidence and limits

The native Dual CT bundle's field definitions corroborate gridConnectionPower_L1,
L2 and L3 at fields 962, 963 and 772; powGetSysGrid is 515. CT2/solar fields are
separate. The native display sums CT1 phases separately. No measurement timestamp
is defined in that DisplayPropertyUpload schema; UTC timezone fields are not time
of measurement. The observed frame-envelope sequence is not a timestamp either.
No proprietary source bundle or household payload is copied into Git.

A bounded private passive observation ran 01:20–01:35 UTC. It published no MQTT
message, issued no hardware command, and changed no Homey/Energy setting. It
compared live CT1 property deliveries with existing CT1 and independent property-
meter readings. Owner previously confirmed both meters cover the house including
its downstream office/shed, and cautioned that the inputs can differ.

The stream was import-only. It contained a reporting gap of about 14 seconds and
an out-of-order burst even though MQTT retained/duplicate flags were false. Source
arrival therefore cannot stand in for device measurement time. The observer ended;
its finalization readback failed, and a separate fresh readback was obtained.
During the investigation another owner task installed a separate 1.10.63 reserve
bridge and operated the house battery. This was not a stable installed-candidate
acceptance window or a soak. Do not transfer it to the new runtime fingerprint.

Offline candidate replay used the actual source resolver, private in-memory
storage and synthetic lab-only consent. No Homey capability/store/Energy writes.
It supports guarded estimated import accounting and no downtime backfill. The
independent meter and CT1 aggregates differ; absolute interval accuracy, physical
export and true zero are not passed. Counter units/periods from native raw fields
remain separate and are not silently promoted into Homey cumulative totals.

## Confirmed fixes and policy

- Preserve MQTT retained/duplicate facts and receipt wall/monotonic clocks as an
  optional immutable third callback argument. Existing two-argument readers remain
  compatible. Missing metadata is unknown, not live.
- The Energy path rejects retained, duplicate, wrong-topic, unknown-metadata,
  late-queue, malformed/ambiguous sequence and repeated-sequence frames. Sequence
  regression/wrap, receipt gaps of five seconds and wall-clock discontinuity stop
  the session and establish a new anchor after local recovery. No forced global
  broker reconnect or historical replay.
- Candidate power has a five-second logical TTL and a one-second local expiry
  check. Exact installed expiry/rendering latency remains a native acceptance item.
- Unrelated CT2/voltage/counter traffic no longer erases a valid CT1 power anchor.
  It also cannot renew power freshness. Partial CT1 power remains invalid; no mixing
  cached phase values, filling omitted zeroes or adding CT2.
- Commit derived import/export totals before projection; keep totals across missing
  data, expiry and recovery; never integrate unseen downtime. Meter values start
  with observed CT1 power and do not copy raw/lifetime vendor counters. Approximate
  power and estimated totals are disclosed in pairing.

## Combined source and preservation

The review snapshot preserves the separately developed reserve-control bridge,
including its source updates since the installed 1.10.63 archive. Its gate, manual
ownership, fresh readback and lease restoration behavior are not replaced by a
meter-only build. It remains a separate control surface: CT1 pairing sends no
battery command. The bridge source is still being commissioned in the HomeyPro
project; compare its latest source/installed package again before deployment.

No device, Flow, meter exclusion, battery setting or existing control gate is
changed by building or reviewing this candidate. A non-clean installation restarts
readings and may resume an already enabled reserve watchdog from preserved settings.
Deployment therefore needs a coordinated idle/lease checkpoint, owner approval,
private preservation baseline and immediate readback. Do not silently disable an
existing coordinator or bridge to obtain a clean test.

## Remaining native acceptance

Owner approval is needed for installation and one CT1 Energy adoption. Recheck
source inventory immediately before/after adoption and around asynchronous writes.
Preserve the Office/Emporia/Octopus exclusions if still as reviewed; no automatic
changes to other meters. Pair the new Energy contributor only once, retaining the
existing monitor identity/history. Review any paired-name cleanup separately.

Then prove native visibility, stored counter continuity, cancellation/failure,
upgrade/recovery and installed timing. Observe available natural import/export/zero
and matched intervals without operating loads or batteries under this document's
authority. Propose any necessary controlled test separately. Start the qualifying
48-hour soak only on the final adopted runtime with an agreed scope. Exact source
CI, local installation, Test delivery and production remain separate decisions.

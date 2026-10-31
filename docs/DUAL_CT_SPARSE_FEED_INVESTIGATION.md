# Sparse Dual CT feed investigation — 31 October 2026

## Dual CT native bridge trace and validation proposal — 31 October 2026

Static trace now reaches EFSmartDeviceModule.sendMsg. Product-specific request is
ConfigWrite 254/17, dst 2, ddst 1, V3, field 71 true only, needAck false, 6000 ms.
Device-scoped session supplies same selected src/dest serial and actionId 0. Actual
wire framing/topic/transport and firmware persistence remain inside native code or
hardware; no MQTT encoder or command is qualified by this trace.

Correction: Dual CT UI handles custom legacy 21 AND shared display 39. No field
command-ID evidence yet shows that 39 caused a rejection; acceptance unchanged.
Prepared [review protocol and vendor draft](DUAL_CT_TELEMETRY_REQUEST_REVIEW.md).
Opening the native meter screen may send an upload command, so the proposed
observation is approval-gated and not represented as purely read-only hardware work.
No runtime/source behaviour change, hardware operation, install, publication or
external message. Prior 1,358-test result remains applicable; this step changes docs
only. Test/Live/installed state not freshly queried and unchanged by this work.


## Sparse-feed reproduction and telemetry qualification — 31 October 2026

Scope: offline regression tests and read-only research only. Diagnostic branch
fetched and matched origin at 26cc4a1 before edits. Existing local AI workflow
changes preserved. No runtime changes, version bump, hardware requests, release,
installation or tester message.

### New field evidence and its limits

The latest 1.11.18 support summary distinguishes a busy shared socket from two
target deliveries: one unrelated envelope and one accepted CT1 sample. The trial
recorded one anchor and no eligible interval. Both consumers are represented in
separate preview/trial arrays; a single preview entry is not a missing second device.
A roughly one-minute-old sample can remain recent in the 90-second detail display
while the five-second Energy freshness contract has already expired. Neither the
anchor nor shared socket activity establishes sustained measurement coverage.
The report covers about four minutes of socket lifetime, not a completed soak.
No raw report, device identifiers or private correspondence is stored here.

### Sprint 1 results

Two synthetic regressions reproduce the new evidence classes:

- `test/appMqttSharedDelivery.test.js`: two same-meter consumers receive identical
  receipts, while 1,205 other-device frames leave their target receipt ages unchanged.
  The shared count reaches 1,207 with no routing rejection. Neither consumer causes
  an extra subscription, disconnect or implicit freshness renewal.
- `test/dualCtEnergyDriver.test.js`: unrelated envelope, one CT1 anchor, 59.6-second
  silence, detail expiry, identity refresh and resumed uploads. The real driver
  retains its subscription and precise checkpoint, clears stale Energy power,
  rejects the cross-gap interval, re-anchors, then integrates only a fresh one-second
  interval. No missing energy is backfilled; export totals are preserved.

Existing tests cover single-phase import/export, retained/duplicate/reordered
messages, socket replacement, independent consumer removal and restart preservation.
No new delivery defect was demonstrated by these sequences. Tests prove the local
behaviour under synthetic input, not the cause of the field silence or accuracy.

Validation: locked Node 22 npm ci, 1,358 tests, lint and release:check pass.
Hardware acceptance remains pending; those checks were not bypassed.

### Sprint 2 research: stronger native-app lead, not an executable approval

Official reference re-read in the browser:
https://developer-eu.ecoflow.com/us/document/PP3?id=2115695633708867585
It explicitly covers STREAM 5000 / 5000 AC. It does not provide the product-421
Dual CT command, reporting cadence or measurement-time contract needed here.

Upstream primary source reviewed:
https://github.com/shuette42/ecoflow-energy-ha/blob/main/custom_components/ecoflow_energy/ecoflow/cloud_mqtt.py
Its get-all/latestQuotas paths are investigative leads, not product-421 proof.
The sparse-feed recovery comment identifies PowerOcean Plus; enhanced recovery
also sends a SET. Do not copy that recovery routine into this integration.

Read the already installed native app's DualCt.bundle as static data only:
EcoFlow 6.17.5 build 88, SHA256
`3e72e19895a4ece9a9f237d89c23687dfef71317862f53eb86d133c5833be26c`.
No bundle or extracted proprietary source is committed or indexed.

Findings:
- The Dual CT online hook invokes the product-specific command sender with
  `activeDisplayPropertyFullUpload: true`.
- That sender encodes `ConfigWrite`; configuration is cmdSet 254, cmdId 17,
  destination 2, protocol V3, timeout 6000 ms, needAck false. The flag is bool
  field 71. This is a configuration-command path, not a verified read-only GET.
- Adjacent schema fields include upload-period configuration. They are NOT part
  of the observed flag-only request and must not be populated or defaulted.
- Shared native fetching also tries cache first, with a full-data request fallback.
  Cached success cannot prove a new physical measurement or live stream.
- The bundle names display IDs 39 and legacy 21; the Dual CT custom decoder
  explicitly handles 21. Presence of 39 in shared constants is not evidence that
  the rejected field packet used 39 or that admitting it would fix silence.

This is a plausible on-demand upload mechanism, not proof that it caused the
observed sample, produces a continuous stream, or is safe to invoke unattended.
No new command encoder, publish path or broader decoder acceptance was added.
The existing ES21-only house-read bridge must not be widened to product 421.

### Next bounded work and approval packet requirements

1. Trace the native command sender through its transport/outer envelope and reply
   handling using static code/existing authorised evidence. Confirm exact scope,
   routing, whether flag-only encoding changes persistent configuration, and whether
   it triggers one snapshot or sustained reporting. Do not infer these from names.
2. If still ambiguous, prepare a precise vendor question about product 421 / current
   firmware: supported snapshot/stream request, cadence, measurement timestamps,
   required renewals, persistence and cancellation. Draft only; owner approves send.
3. Only after the envelope is qualified, propose one explicitly approved device
   experiment: no periodic scheduler, no automatic retry/reconnect, one selected
   owned meter, unchanged settings baseline, bounded response deadline, stop on
   unexpected changes, separate replies/echoes from live uploads. Any rollback or
   persistent setting restoration needs its own concrete procedure, not guesses.
4. Demonstrate repeated fresh CT1 intervals before reference accuracy testing and
   48-hour soak. Keep gaps unknown. A polling snapshot may help display while still
   being unsuitable for energy integration; do not stretch freshness to conceal it.

Sprint 1 reproduction is complete. Sprint 2 research produced a specific lead;
telemetry qualification and any hardware trial remain incomplete. Test, Live,
Mainline and installed Development are unchanged by this work.


## Dual CT 1.11.17 zero-delivery investigation — 31 October 2026

Reviewed and locally decoded the newest private tester support summary. Both roles
show connected/listening, two active topics, zero pending/rejected/timed-out topics,
zero routed frames, zero decoder rejections, no retry scheduled. Detailed monitor
waited about 382 seconds. Whole-property Energy remains unconfirmed/inactive per
tester correction; a paired community-trial role is not proof of Energy selection.

Confirmed diagnostic defect: receivedFrames is incremented only after topic/serial
routing, so zero cannot distinguish socket silence from discarded routing traffic.
Added bounded current-connection socket message, route-rejection and PINGRESP counts,
relative ages and explicit shared_current_connection scope. These are shared socket
observations, not Dual CT-specific receipts; other devices may contribute. Existing
per-device delivery counters remain separate. Old socket callbacks cannot update
new evidence, and replacement connections reset socket counts. No new subscription,
publish, reconnect, timer, control, decoder permission or accounting change is added.
Red regression reproduced the missing evidence; all 1,356 tests, locked Node 22
install, lint, release:check, diff check and pinned CLI verified validation pass.
Changes remain local for candidate review, without version bump or publication.
Test 1.11.17/build 84, Live and installed Development were not changed by this task.

Delivery failure remains unexplained. Upstream HA cloud_mqtt.py uses the same two
app topic families, plus an open quota topic; non-listen-only paths send explicit
get-all/latestQuotas and optional stream activation. Its comments about stale feeds
include other products, not validation for this Dual CT/firmware. Do not copy its
SET/stream switch or treat reply payloads as fresh Energy intervals. Reference:
https://github.com/shuette42/ecoflow-energy-ha/blob/main/custom_components/ecoflow_energy/ecoflow/cloud_mqtt.py

Bounded sprints:
1. Evidence/routing audit COMPLETE: decoded report; reproduced diagnostic ambiguity;
   regression-tested socket-vs-route-vs-consumer separation and privacy.
2. Field delivery qualification PREPARED: review/release the diagnostic correction;
   collect one current summary under ordinary use. Shared socket zero + recent
   PINGRESP means broker responsive but no PUBLISH reached this socket. Socket
   messages with route rejects require route investigation; socket messages without
   rejects but no target frames mean traffic belongs elsewhere, not target recovery.
   Do not re-pair, reset counters or assume native EcoFlow readings prove MQTT delivery.
3. Demand-driven telemetry/recovery PENDING: if genuine target silence is established,
   first qualify a product-specific read request and its response envelope using
   authoritative/vendor evidence or existing authorised captures. Prepare exact
   one-shot request, no SET/stream activation, cooldown/deadline and echo/reply fences
   for review before hardware execution. A cache reply cannot become live accounting
   evidence. Stable normal-use/48-hour acceptance follows a confirmed correction,
   not merely green tests or an acknowledged subscription.

No extra tester request or external message was sent. Preserve private report locally;
do not upload the original report or household evidence into Git.


Publication update: the reviewed fixes are now on Test 1.11.13/build 80, from
runtime source `8adf1908e0837c7531accdb98fc88161978d740f` with passing exact CI.
See [current handover](CODEX_HANDOVER.md) for archive and preservation evidence.
The preparation findings below are historical; no new hardware pass is claimed.
Installed Development, Live and Mainline remain unchanged.

## Evidence and limits

The community tester supplied a manually transcribed support extract for Test
1.11.12 / Homey 13.5.3. The private correspondence remains outside Git. This is
not a full support JSON, raw capture or packet chronology.

The extract reports two accepted broker topics, connected/listening true, three
received frames, two monitor-accepted packets and one unrelated-message rejection.
The Energy trial records one anchor, one delivery gap and one non-CT1-upload
rejection, with no eligible interval. The last frame is approximately 251 seconds
old. Successful SUBACK and socket connectivity do not establish a continuous feed.
An Energy anchor establishes that at least one observation passed source and
accounting admission; it does not establish sustained three-phase operation.

This evidence does not support a blanket decoder failure or a still-blocked
overlap gate. It also does not establish why delivery stopped, actual packet
order, encoding of subsequent missing frames, or whether native app activity
influenced publishing. Missing packets cannot be decoded or made fresh locally.

## Reproduction

A generated-wire replay supplies a qualified three-phase CT1 frame, a second
frame after six seconds and an unrelated command one second later, then advances
the clock until the last delivery is 250.6 seconds old. This is one sequence
consistent with the extract, **not a reconstruction of the tester's actual wire**.

The real monitor, community qualification, Energy driver and session reproduce
two accepted packets, one unrelated-message rejection, one anchor, one gap and
two delivery rejections. Eligible interval and rejected-gap duration are both zero:
the guard's `delivery_gap` classification does not carry the session's separate
`gap` duration. Zero duration therefore does not prove complete coverage.

Power becomes unknown/unavailable; the precise checkpoint is unchanged. Sustained
fresh packets recover on the existing subscription: an anchor followed by a
qualified interval. No missing time is filled. Broker topic retry code was also
checked against the locked MQTT.js implementation: with reconnectPeriod zero,
its reconnect-topic cache does not suppress these subscription attempts. Existing
real-broker denial and bounded missing-acknowledgement tests remain intact.

## Confirmed additional defect and local fix

A fast socket replacement was invisible to the Energy delivery guard. Increasing
sequences and a receipt interval below five seconds could integrate across that
interruption. A failing driver regression against the published guard demonstrates
an extra interval committed to the checkpoint. This is a confirmed source defect,
**not an established explanation for the community tester's sparse feed**.

The shared transport now attaches a local connection epoch to immutable receipt
metadata. Replaced-socket connect callbacks are identity-fenced. The guard rejects
the crossing delivery and requests the existing in-place anchor reset. Even an
unrelated command on a new socket invalidates an old anchor. The next qualifying
packet anchors; only a following eligible interval advances totals. Existing
two-argument consumers remain compatible; injected legacy receipts without epochs
retain their existing behavior, but cannot bridge an identified connection.

`connection_changed` is a fixed, whitelisted local trial classification. Epochs
are not device IDs, timestamps, storage values or public support payload fields.
No new request, stream-switch command, resubscription loop or socket reset was
introduced. Five-second Energy eligibility, retained/duplicate rejection, source
qualification and detailed-monitor field expiry are retained.

## Verification and remaining gate

Regression coverage includes sparse-feed expiry and recovery, checkpoint
preservation, single-phase and community three-phase import/export across a fast
socket change, duplicate handling, malformed/missing epoch transitions, shared
consumer epoch identity and late connect callbacks. Published-guard replay passes
the sparse scenario and fails the two new accounting/guard boundary regressions;
the candidate passes them. Only ignored compiled output was temporarily replaced
for this comparison, then restored; tracked source was not reset.

Local Node 22 committed-lockfile installation (audit clean), all 1,331 tests,
lint, release checks and pinned Homey CLI 4.5.3 verified validation pass. These
checks are software evidence; no new CI, store build or field pass is claimed.

The candidate remains local, uncommitted and unversioned with the independent
original STREAM recovery work preserved. Release is on hold. Test, Live,
Mainline and the installed app are unchanged. No device/settings/Flow/counter
mutation, restart, repair, re-pair or external message was performed.

Review the source candidate before deciding a further Test build. Sustained
three-phase delivery and recovery remain open hardware gates. The present extract
is sufficient for this investigation; no repeated capture is requested. Any
future attempt to stimulate the feed or obtain additional targeted field evidence
needs its own justified scope and owner review. Keep existing paired devices and
counter history intact.

## Shared app-account recovery candidate — 31 October 2026

New community feedback on Test 1.11.13 reports both Dual CT devices and a physical
STREAM 5000 unavailable, plus the original aggregate. Other original devices
still display values, but their freshness is not established. This broadens the
investigation beyond CT1 interval admission. Screenshots establish unavailable
states, not a broker reason, credential rejection, or confirmed release regression.

Source-only fixes now share one saved-account authentication client per Homey and
exact credential set, bind broker-certificate decryption to the token used by the
successful request, and prevent a late old-token rejection from discarding a
newer session. Explicit pairing clients remain separate; removing/changing saved
credentials invalidates the cache. No account session is persisted or logged.

Two regressions failed on the prior implementation (independent saved-account
clients and certificate decryption during token rotation). Three new tests cover
shared concurrent/later login, credential removal/change and Homey isolation,
certificate response races, and late old-token rejection. Node 22 locked install
(audit clean), all 1,334 tests, lint, release checks and pinned Homey CLI 4.5.3
verified validation pass. No decoding, counter, freshness, overlap or hardware
control rules changed. This is not proof of the field cause or recovery.

Changes are local, uncommitted and unversioned on the diagnostic branch. Existing
AGENTS/local-AI workflow changes belong to other work and are preserved. Test,
Live, Mainline and installed Development are unchanged by this task. No repair,
re-pair, restart, setting, hardware request, new tester capture or message was sent.
Next: review this bounded authentication candidate before authorising a Test build;
confirm recovery on existing devices without counter resets. The original aggregate
failure and sparse delivery still require field confirmation; do not declare them
resolved from unit tests. Private report/screenshots remain outside Git.

## Connection lifecycle review candidate — 31 October 2026

Continued the shared-account candidate with an offline connection/recovery review.
The shared MQTT handshake now rejects pending consumers when its owned socket is
destroyed or shutdown begins, instead of waiting for a broker acknowledgement.
A regression failed before this change and passes afterward. STREAM 5000 subscription
retries now share one in-flight attempt, preventing overlapping timer callbacks
from racing subscription state. Generic connection failures no longer tell users
to change account credentials; missing data remains explicitly unknown.

Additional tests cover shutdown with concurrent consumers, repeated 5000 retry
calls, and a silent serial alongside another actively reporting serial. Original
STREAM source diagnostics now distinguish startup_unverified from an interruption
after successful verification and identity_changed. Existing source-binding gates
remain intact: no silent adoption of a new main, counter reset or re-pair shortcut.
The earlier same-source recovery and credential-order regressions still pass.

Review outcome by issue:
- Shared connection: authentication races and the above lifecycle defects fixed
  locally; no claim that screenshots identify the field broker failure.
- Sparse Dual CT: replay still expires honestly and recovers without backfill;
  silent-device isolation passes. The upstream reason for stopped publishing is
  unresolved. No stream-switch request or quiet-feed reconnect loop was added.
- Original aggregate: verified-source recovery passes; startup/identity blocks
  now distinguishable. The reported aggregate outage is not field-resolved.
- Error wording: generic transport failure no longer blames account settings.

The combined candidate passes Node 22 locked installation, 1,338 tests, lint,
release boundary checks and pinned Homey CLI 4.5.3 verified validation. Counter,
freshness and single-phase/three-phase regression suites remain green. Final
candidate hardware recovery and the 48-hour soak are NOT completed by these tests.
Changes remain local/uncommitted/unversioned. Test, Live, Mainline and installed
Development are unchanged. No hardware operations, external messages or new
capture requests. Existing local-AI workflow changes are preserved separately.

Next bounded step: review the combined source candidate before authorising a
versioned Test build. Field validation should retain existing devices/settings and
check sustained delivery, spontaneous recovery and counter continuity. If it still
fails, distinguish startup_unverified/identity_changed from transport failure using
the existing support report, rather than requesting another broad capture.

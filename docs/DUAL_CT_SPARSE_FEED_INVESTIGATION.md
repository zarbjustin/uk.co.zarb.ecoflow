# Sparse Dual CT feed investigation — 31 October 2026

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

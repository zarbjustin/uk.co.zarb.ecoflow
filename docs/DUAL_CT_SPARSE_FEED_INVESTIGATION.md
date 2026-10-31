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

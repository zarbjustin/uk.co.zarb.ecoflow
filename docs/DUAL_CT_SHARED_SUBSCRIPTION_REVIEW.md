# Dual CT shared subscription and freshness review

## Scope and evidence

Source-only follow-up on the diagnostic branch after Test 1.11.8. Preserve the
pending named-overlap feedback changes. No version bump, archive, source push,
publication, installation, restart, account/Flow/Energy/battery change or tester
request is included.

The latest community report shows both the existing detailed monitor and the
new three-phase Energy meter unavailable, while native EcoFlow phase readings
are visible. This does not establish an Energy-only phase calculation defect.
The native screenshot's signed phase sum agrees with its displayed net total;
its observation and the separately written example are different samples.
Fresh raw delivery to Homey at that time has not been established.

## Reproduced defects and fixes

1. Explicitly signing into the same saved account during another pairing wrote
   all three credential settings again. Existing consumers stop on those settings
   events. Commit now writes only values which actually differ. Actual credential
   changes retain the existing fail-closed stop behaviour. Saved-account pairing
   without a pending explicit login did not take this write path.
2. Every additional consumer (and duplicate registration) for a serial sent the
   same broker SUBSCRIBE requests again. Broker subscriptions now belong to the
   first listener for a serial. Removing one consumer leaves the other running;
   removing the last unsubscribes; reconnect restores all remaining serials.
   Duplicate SUBSCRIBE requests are confirmed; resulting broker churn/replays in
   the reported installation are not established.
3. A saved callback from an old connection could deliver into current listeners
   and receive a new receipt timestamp. Old close/offline callbacks could also
   tear down a replacement connection. Callbacks now check connection identity;
   message listeners are detached during teardown and reject delivery after end.

Synthetic regression tests reproduced unchanged-account writes, duplicate topic
subscriptions and late-frame delivery before the fixes. Additional coverage uses
an actual detailed-monitor driver with settings events to verify continuity for
same-account pairing and safe stopping on changed credentials. Shared transport
coverage checks both consumers, duplicate handler registration, independent
unsubscribe, reconnect, return after the last unsubscribe, immutable shared
receipt metadata, retained/duplicate flags, and old-socket disconnect fencing.

## Accounting and acceptance boundaries

No phase selection, source binding, overlap decision, counters, capability IDs,
Insights history or Flow identifiers change. Existing single- and three-phase,
replay, sequence, five-second freshness, restart and counter-continuity tests
remain in the full suite. Retained/duplicate packets are not promoted to fresh
Energy data; no stale interval is integrated or backfilled. The detailed monitor
and Energy roles retain their different freshness requirements.

These fixes address confirmed software defects. They do not prove the cause of
the community report or establish three-phase hardware acceptance. No new
capture has been requested. A later reviewed candidate needs exact CI/archive
checks and separate approval for installation/publication, followed by an
attended observation that both roles recover and receive qualifying CT1 frames
without loss of counters. Do not delete or re-pair devices as a diagnostic step.

## Local validation

Node 22.23.4 and committed-lockfile tooling: all 1,295 tests pass, including the
pending overlap-message regressions. See the newest handover/status checkpoint
for final lint, release and pinned Homey validation outcomes. No hardware gate
or acceptance ledger is promoted by these software tests.

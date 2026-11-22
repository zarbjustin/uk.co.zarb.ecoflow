# Dual CT shared-delivery bug bash — 31 October 2026

Scope: uncommitted source candidate after Test 1.11.11/build 78. No version bump,
push, CI run, publication, installation, restart, repair, hardware request or
account/Energy/Flow setting change is part of this bug bash. Private messages,
screenshots, IDs and raw telemetry remain outside Git.

## Field evidence and historical comparison

The community tester reports both the old detailed monitor and new three-phase
Energy device remain unavailable on 1.11.11 while the native app updates. This is
a **failed field recovery result**, not a pass inferred from the earlier software
suite. Native phase readings support signed netting; they do not prove receipt by
Homey, simultaneous wire-field completeness or Energy counter accuracy.

Comparison from the initial detailed monitor (`1666605`) through 1.11.11 retains
its separate latest-field display decoder and 90-second field expiry. The Energy
path did not replace that decoder. Both depend on the shared app-auth MQTT feed.
The 1.11.9 socket-fencing/shared-consumer changes and 1.11.11 in-place gap reset
remain valid fixes, but do not establish the tester's current root cause.

## Confirmed defects and source fixes

| Case | Published behavior | Candidate behavior and evidence |
| --- | --- | --- |
| Concurrent connection readiness | A second caller returns when the socket object exists, before CONNACK | All callers await the existing handshake; a regression fails against published source and passes here |
| Failed/missing SUBACK | Error logged without topic retry or acknowledgement deadline; connected socket mistaken for usable delivery | Per-topic 10-second deadline, at most three attempts, 5/10-second retry delays; successful topics and shared socket remain intact |
| Late SUBACK after replacement | No owned attempt state to classify a topic reliably | Socket/attempt identity fences ignore late acknowledgements; detach/end cancels deadlines/retries |
| Topic scope | Serial inferred from loosely parsed topic alone | Exact current property/get-reply topics required before fan-out or receipt evidence |
| Listener exception privacy | Exception text could enter logs | Fixed classification only; peer listeners keep receiving |
| Unavailable-device diagnosis | No broker-acceptance evidence; monitor reports aggregate rejection count | Bounded per-device topic/receipt counts plus fixed monitor rejection reasons distinguish subscription failure, no delivery and decode rejection |

A real MQTT.js v5 in-memory broker regression (the committed dependency, no
network) sends a broker denial, observes a second wire SUBSCRIBE, acknowledges it
and delivers a frame to both listeners. Mocked lifecycle tests additionally cover
missing acknowledgements, thrown/callback failures, independent detach, bounded
retry exhaustion, stale acknowledgements, foreign topics and shutdown cleanup.

Support snapshots whitelist booleans, small counts and receipt ages. They do not
copy topics, serials, user IDs, account tokens, exception text or payloads. These
are local reports, not automatic uploads. A successful SUBACK or incoming frame
never marks readings fresh or permits Energy integration by itself. Protocol,
field completeness, retained/duplicate rejection, five-second accounting
eligibility, checkpoints and single-phase semantics are unchanged.

## Home Assistant comparison

Reviewed the source, without running it, at
[`shuette42/ecoflow-energy-ha` commit `2cebae3`](https://github.com/shuette42/ecoflow-energy-ha/tree/2cebae310ca574ff988cad4b7b80ba8c225c7160).

- Its [cloud transport](https://github.com/shuette42/ecoflow-energy-ha/blob/2cebae310ca574ff988cad4b7b80ba8c225c7160/custom_components/ecoflow_energy/ecoflow/cloud_mqtt.py)
  uses the same property/get-reply topic family; it also subscribes to JSON quota
  and has explicit initial/status request mechanisms. Some stale-feed recovery
  sends requests. Those publications are not copied into ordinary Homey
  subscriptions: they require separate model qualification and owner review.
- Its [smart-meter parser](https://github.com/shuette42/ecoflow-energy-ha/blob/2cebae310ca574ff988cad4b7b80ba8c225c7160/custom_components/ecoflow_energy/ecoflow/parsers/smart_meter_proto.py)
  explicitly documents **BK21 EF-EM-P3-120**, not a qualified Dual CT contract.
  It handles masked property frames and plain multi-header get replies through
  the [STREAM decoder](https://github.com/shuette42/ecoflow-energy-ha/blob/2cebae310ca574ff988cad4b7b80ba8c225c7160/custom_components/ecoflow_energy/ecoflow/parsers/stream_proto.py).
  Homey's Dual CT monitor intentionally admits only its current qualified/plain
  candidate forms. The new unsupported-encoding/header/decode classifications
  expose this potential gap without guessing alternate bytes or weakening Energy.
- Its native-counter mappings and missing-zero assumptions are not adopted for
  Dual CT, and no cached reply becomes a live Energy accounting sample.

## Validation and remaining review

Node 22, committed-lockfile `npm ci`, 1,321 tests, lint, release-boundary/ledger
checks and pinned Homey 4.5.3 verified validation pass locally. The two targeted
before/after regressions were run against a temporary transpilation of published
source: both fail there and pass with this candidate. Only ignored compiled
output was temporarily swapped, then restored; tracked source was not reset.

The tester's actual shared-feed failure is still unproven. After candidate review,
a separately authorised Test build can reveal whether the socket/topic is accepted,
whether frames reach both consumers, and whether encoding or field guards reject
them. Existing paired devices, settings, counters and history should be retained.
Do not request another broad capture, force reconnection or ask for re-pairing as
a shortcut. No three-phase hardware acceptance or full-release readiness is claimed.

## Focused reliability bug bash — 31 October 2026

Completed the bounded offline review of authentication, mixed-device startup,
connection lifecycle, durable counter recovery and repeated recovery cycles.
Added four regressions: twenty concurrent failed sign-ins share at most one
attempt per allowed region and subsequently recover with one login; auth failure
logs exclude arbitrary upstream text; thirty failed-handshake/recovery cycles
retain both meter/battery consumers without accumulating managed timers or replaying
late frames; an applied checkpoint write whose acknowledgement fails restores the
durable total and starts a new anchor without double-counting or filling the gap.

Confirmed additional defect: auth/MQTT error logs forwarded arbitrary upstream
exception text. Those paths now use fixed failure labels, including app-owned
MQTT connect/reconnect/teardown logging. The new privacy assertions failed before
this fix and pass afterward. No claim of an actual credential disclosure is made.
The behavioral assertions in the new recovery/durability tests already passed;
no speculative accounting or connection-policy change was made for those cases.

Existing full-suite checks also cover original/ES21/ES22/Dual CT coexistence,
50 research-listener detach cycles, actual locked MQTT.js SUBACK rejection/retry,
bounded missing acknowledgements, stale callback isolation, single/three-phase
accounting, storage conflicts/readback failure and a synthetic 72-hour ledger
replay. These are simulated/offline checks, not field telemetry or heap profiling.

Combined candidate: Node 22 committed-lockfile installation (zero audit findings),
all 1,342 tests, lint, release checks and pinned Homey CLI 4.5.3 verified validation
pass. No new field recovery conclusion: sparse delivery and the reported original
aggregate outage remain unresolved in the field; final-candidate 48-hour hardware
soak remains outstanding. Keep them distinct from passing regression tests.

All changes remain local, uncommitted and unversioned on the diagnostic branch.
Previous fixes and unrelated local-AI workflow edits are preserved. Test, Live,
Mainline and installed Development remain unchanged. No hardware command, restart,
re-pair, setting/Flow operation or external message/capture request was performed.
Next: review/version the combined candidate for a separately authorised Test build,
then verify recovery with existing devices rather than adding speculative fixes.

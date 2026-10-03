# Mixed-generation discovery and release gates

Prepared 4 October 2026. Research and validation only: this Test candidate does
not group installations, admit new models or enable STREAM 5000 writes.

## Evidence and intended experience

[Plug-In Solar's first-hand report](https://www.pluginsolarexplained.co.uk/blog/ecoflow-stream-5000-ultra-x-linked-one-system/)
shows an original Ultra X linked into a STREAM 5000 installation, one system
percentage with separate unit readings, and a linking warning about deletion of
the old system/data if no STREAM device remains there. It also reports shared
scheduling/reserve. This informs the experience, not a supported API contract.
Do not copy its example power limits into generic control limits.

Proposed destination: one **STREAM Home Battery per actual EcoFlow installation**,
with optional original/new-generation physical monitors. Prefer authoritative
system SOC and signed power. Do not add existing BK and ES aggregates together
or average percentages. The current admitted new-generation model remains
AC 5000 / ES22; the PV-equipped STREAM 5000 needs separate model admission.

## Safe evidence collection

Start with users who have already linked their batteries. Do not ask anyone to
link/unlink solely for testing: EcoFlow may delete history. Further transitions
need explicit approval after the user reviews EcoFlow's warning and preserves
any history they need. Never copy account secrets/full serials into public docs.

Collect firmware and EcoFlow app versions, installed Homey app version/channel,
Homey OS/mobile versions, the local support report and time-aligned, redacted
EcoFlow overview/unit and Homey device/Energy screenshots. Record whether values
describe the whole installation, a unit or a sub-group. Private serial-keyed
membership evidence must remain private; only masked synthetic/public fixtures
may enter the repository. Missing fields mean unknown, not zero.

## Validation cases

| Case | Required observation | Passing condition |
| --- | --- | --- |
| Original-only and AC-5000-only controls | Existing percentages, signed watts and kWh before/after Test upgrade | Existing identity/totals persist; one aggregate contributes to Energy |
| Already linked BK + ES installation | System membership/identity, system SOC, each unit SOC and power | One authoritative aggregate accounts for both generations without overlap |
| Independent installations on one account | Distinct groups with their own SOC/power | No account-wide merge; retain separate Home Batteries |
| Unequal unit SOC/capacity | Full and nearly empty units; expansion capacity when available | System SOC follows EcoFlow, not a simple mean; capacity is not counted twice |
| One unit unavailable/reconnect | Available versus stale unit/system fields | No borrowed readings; grouping/freshness remains correct |
| Approved linking/unlinking/removal | Old/new group identity and counter origin before/after change | Explicit migration, no hidden reset/double-count, clear Flow/history impact |
| App restart and source/master changes | Stored totals, resumed stream and stable group identity | No downtime backfill or accidental creation of duplicate aggregate |

## API investigation questions

1. Is there a stable installation/Space identifier and explicit battery membership
   independent of which serial supplies telemetry? A peer record or matching
   account alone is insufficient.
2. After linking, does BK `mainSn` routing continue to describe the original
   sub-group, expose the complete installation, change leader, or lose access?
   Does the ES aggregate already include the BK unit's power/capacity/SOC?
3. Are expansion batteries independent members, or capacity included in a host?
   Which actual/certified capacity belongs in the system percentage?
4. Which counters are unit/sub-group/system scoped, and can their origin change?
   Preserve historical Homey totals without treating a new origin as energy.
5. Are reserve/mode commands system-scoped after linking? Do existing BK controls
   remain safe, become redundant, or conflict with EcoFlow scheduling/AI?
   Discovery is read-only; do not send experimental commands to answer this.
6. Can local mode supply validated telemetry/control independently of cloud?
   Product-level local-mode support is not proof of an accessible Homey API.

## Implementation gates

- Record field provenance, units, freshness, scope and firmware with fixtures.
- Require linked-positive and independent-negative cases before enabling grouping.
- Specify user-confirmed, reversible Homey migration: stable pairing identity,
  authoritative source, stored-counter continuation and Flow/history impact.
- Keep unit monitors out of Homey Energy. Never preserve both overlapping
  installation aggregates as active Energy sources after migration.
- Validate command scope, readback, physical behaviour and failure recovery
  before any new controls. Electrical/phase/breaker protections remain managed
  by EcoFlow, not speculative Homey commands.

## Tester request draft — not sent

We are testing telemetry/accounting fixes first, without changing your pairing
or automatically combining Homey batteries. If you already have original STREAM
and 5000-series units linked in EcoFlow, please share redacted screenshots of the
combined overview and individual batteries at the same time, device firmware and
EcoFlow app versions, and Homey's local support report. We also need someone
with independent installations on one account. Please do not link/unlink just
for this test: EcoFlow's linking warning may involve deletion of system history.
The exact Test candidate/version will be confirmed after publication.

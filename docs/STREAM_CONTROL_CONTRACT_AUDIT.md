# STREAM control-contract audit — 17 October 2026

Read-only research for the diagnostic release-hardening wave. No encoder,
command sender, target-power capability, new action or control enablement is
implemented. Public upstream experience is not our hardware acceptance.

## Official Developer API

The [official STREAM page](https://developer-eu.ecoflow.com/us/document/PP3?id=2058828605315256321)
was re-read in the rendered portal during this audit. It still presents BK
examples and main-device routing, with unit-addressed relay exceptions. It is
not an ES21/ES22 protobuf or mixed-generation controller-migration contract.

It recommends reserve 3–95%, a reserve three percentage points above discharge
floor and a charge ceiling of 95%. Existing legacy helpers still accept 100%
and were not silently redefined in this wave: changing saved Flow arguments or
physical policy needs its own compatibility decision. The recommendation delta
remains an explicit control-release review item, not a newly verified 5000 rule.
The page describes signed grid-port and aggregate battery power, but contains
ambiguous labels for other readings; do not derive grid/load/SOC semantics from
one table label or reuse cloud heartbeat as a per-field measurement timestamp.

## ES21 / ES22 community implementation

Reviewed [command implementation at d247b30](https://github.com/shuette42/ecoflow-energy-ha/blob/d247b303a852366f66fdf6009a1fcb0250d4319d/custom_components/ecoflow_energy/ecoflow/stream_ac5000_commands.py).
These observations inform future commissioning, not permission to copy a writer.

| Setting | Upstream wire/readback observation | Required acceptance |
| --- | --- | --- |
| SOC limits | Paired values in config 29; prompt readback can use 32/2 fields 1.7 and 1.21 | Preserve the other limit; prove model/scope and physical threshold behaviour. |
| Reserve | Config 30 carries enable flag and percentage together | Preserve enablement; distinguish protection policy from a command to charge. |
| Grid input limit | Config 10.2 is separate from scheduled charge power | ACK is not physical enforcement; validate bounds and actual input. |
| Grid output limit | Config 10.1 has per-unit companions and a reported ceiling | Never invent companion values or apply nameplate power as a safe bound. |
| Tasks | Write 39/read 40; charge settings can be per device, discharge system-wide | Preserve slot, SOC target, window and existing schedules; establish linked-meter behaviour. |

The upstream account explicitly reports that stored scheduled charge power did
not establish the expected charging rate. Meter-linked discharge can behave
differently from unmetered discharge. Consequently a decoded setting, ACK or
readback cannot establish pause, safe wattage control, installation-wide scope
or compliance with a requested charge target. BK and ES envelopes are distinct.

## Commissioning sequence when owner equipment arrives

1. Record exact model/firmware, wiring, circuit roles, paired topology and native
   modes; keep a private backup of original settings. No household credentials
   or serials in Git. Identify the authoritative grid meter and possible overlaps.
2. Observe only: grid import/export, phase netting, battery charge/discharge/idle,
   PV, backup socket, expansion inclusion and mixed-generation reporter changes.
   Compare EcoFlow and Homey with receipt versus measurement time distinguished.
3. Exercise restart, network loss, sparse/reordered data and capability-update
   failures. Preserve identity, history and totals; no downtime backfill or stale
   controller fallback. Validate the native desktop/mobile settings bridge.
4. Review a separate, bounded control pilot for each model: explicit approval,
   safe starting state, one setting, actual power response and restoration.
   Assess reserve/ceiling conflicts, native schedules and input-versus-task limits.
   Do not equate zero input limit with blocked direct PV or a lower SOC ceiling
   with a verified pause command. No control pilot is authorised by this document.
5. Independently validate CT1 mapping/sign/timing and power-accounting continuity
   before separately adopting a new Energy source. Do not convert the preview,
   count CT2 hybrid throughput as solar or silently replace an existing P1 meter.

No additional Robert export is planned. Until these gates pass, keep the 5000
integration monitoring-only, Dual CT a display-only preview, and all new Energy
and coordination writers disabled. A monitoring release can be reviewed on its
own scope; experimental functions do not all need to become production features.

# Original STREAM Flow capability audit

Code review: 4 October 2026. Sources: `drivers/stream/device.ts`,
`lib/streamProtocol.ts`, `app.ts` and `.homeycompose/flow/`. This describes the
current implementation, not newly verified hardware behaviour. The 5000 beta
remains read-only and is excluded by these cards' `driver_id=stream` filters.

| Action | Implemented command semantics | Important limit |
| --- | --- | --- |
| Set current electricity price | Stores a Homey capability; price comes from another app/Flow | Does not fetch a tariff or choose cheapest intervals |
| Prepare for cheap grid import | Charge limit 100%, then backup reserve sequence with readback | A reserve/mode policy, not a specified wattage or guaranteed physical charge |
| Prepare for peak/export | Backup reserve sequence, then grid feed-in enabled | Removes constraints; does not force a particular export power |
| Release for export | Reserve 3%; discharge limit lowered first if required; feed-in enabled | Device/load/grid constraints still apply |
| Charge/discharge limits | Maximum charge SOC / minimum discharge SOC | Percentages, not watts |
| Set operating mode | Self-powered / AI / scheduled / TOU flags | Does not configure or validate a complete schedule |
| Set grid feed-in | Grid-feed mode 1/2 | Export permission, not a charging switch or power setpoint |

The reserve sequence protects against API 8524 and polls to verify reserve.
Several other actions update their capability optimistically after API success;
that is not proof of a physical response. Multi-command sequences can partially
apply. Existing warning/readback handling is not automatic rollback.

## Henry's cheap-price / external Enphase solar use case

Existing cards can support a policy driven by an explicit tariff price, SOC,
grid reading and external solar measurement. Use the Home Battery, and keep
price units consistent. External rooftop generation is not necessarily reported
as STREAM MPPT power; the `charging_from_solar` condition uses STREAM PV minus
its reported load, so it cannot reliably classify external Enphase surplus.

Suggested recipe to validate manually before automating:

1. Feed the current tariff price into **Set current electricity price**.
2. On a cheap-price transition, if below the chosen SOC target, use **Prepare
   for cheap grid import** with a deliberately chosen reserve. Read back reserve,
   charge limit, state and actual battery power; do not infer charging from command
   success alone. Avoid repeatedly sending identical commands each telemetry tick.
3. On leaving the window, restore previously recorded normal reserve, discharge
   limit, charge limit, operating mode and feed-in settings as appropriate.
   The reserve helper may alter discharge limit; restoring reserve alone is
   not a full restore. Resolve conflicts with EcoFlow schedules/AI first.
4. For solar-surplus decisions, use the external solar/grid app's measurements,
   a deadband and dwell time to avoid rapid toggling. Validate import/export sign
   and whether those measurements include the battery before using them as triggers.

The request for **minimum 700 W charging or idle** is not met by the current
command builders. No minimum-power, direct watt target or battery charge-enable
command is exposed here. Do not translate 700 W into a made-up reserve value or
claim that disabling feed-in stops all battery discharge.

## Follow-up before adding controls or control widgets

- Verify command/readback and actual response on BK hardware, including restoring
  the full previous state after partial failure.
- Establish stale-price/state handling and one automation authority so multiple
  Flows, schedules and EcoFlow AI cannot fight over controls.
- Require a documented and hardware-validated command contract for equivalent
  5000 functionality; never reuse BK commands simply because both are batteries.

No live Flow, tariff schedule or device control was changed during this audit.

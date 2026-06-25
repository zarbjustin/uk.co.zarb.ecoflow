# Octopus Agile + STREAM: ready-made Homey Flows

These recipes use the **EcoFlow STREAM Series** Flow cards together with the
[Octopus Energy](https://homey.app/) (Agile) app for Homey to optimise your battery
against half-hourly prices. They rely only on the controls the EcoFlow open API
actually exposes — operating mode, backup-reserve target, charge/discharge SoC limits
and grid feed-in — because the API has **no direct charge/discharge watt setpoint**.

> Devices: add your **STREAM** system device (the home-battery device). The cards
> below appear under *EcoFlow STREAM Series*.

## 1. Charge in the cheapest window
**When:** Octopus Agile *price is below* `X p/kWh` (or "is in the cheapest period").
**Then:** EcoFlow STREAM → **Prepare for cheap grid import** → reserve `100%`.

This lifts the charge limit to 100% and sets the backup-reserve target so the battery
pulls a charge from the grid while power is cheap.

## 2. Stop charging / hold when price returns to normal
**When:** Octopus Agile *price is above* `X p/kWh`.
**Then:** EcoFlow STREAM → **Set backup reserve** → `20%` (your normal floor)
and optionally **Set charge limit** → `80%`.

## 3. Export / discharge during the peak
**When:** Octopus Agile *price is above* `Y p/kWh` (peak), **and** (condition)
EcoFlow STREAM → **Battery level is above** `30%`.
**Then:** EcoFlow STREAM → **Prepare for peak / export** → reserve `10%`.

Lowers the reserve so the battery can discharge and turns on grid feed-in to export.

## 4. Protect a morning reserve
**When:** time is `05:30`.
**Then:** EcoFlow STREAM → **Set backup reserve** → `50%` so you keep enough for the
morning regardless of price.

## 5. Self-powered by day, scheduled by tariff at night
- **When** sunrise → **Set operating mode** → `Self-powered`.
- **When** sunset → **Set operating mode** → `Time-of-use` (or `Scheduled`).

---

### Card reference
| Card | Type | What it does |
| --- | --- | --- |
| Prepare for cheap grid import | Action | Charge limit → 100% + backup reserve → chosen % (grid charge in cheap window) |
| Prepare for peak / export | Action | Backup reserve → chosen % + grid feed-in on (discharge/export) |
| Set operating mode | Action | Self-powered / AI / Scheduled / Time-of-use |
| Set backup reserve | Action | Reserve floor 3–95% |
| Set charge limit / Set discharge limit | Action | Max charge SoC / min discharge SoC |
| Set grid feed-in | Action | Export on/off |
| Battery level is above/below | Condition | Gate any flow on SoC |
| Solar power is above | Condition | Gate on live PV |
| Operating mode is | Condition | Gate on current mode |

> Tip: combine the **Battery level** condition with the Octopus price triggers to avoid
> charging an already-full battery or exporting below your reserve.

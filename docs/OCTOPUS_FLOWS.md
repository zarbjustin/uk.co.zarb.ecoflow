# Tariff-aware STREAM Flows (provider-agnostic)

These recipes optimise your STREAM battery against your electricity tariff. The app is
**provider-agnostic**: it doesn't fetch prices itself, so it works with **any** tariff app in
**any** region — feed your current price in from the tariff app you already use (Octopus Agile,
**Tibber**, **aWATTar**, ENTSO-E, etc.).

## Native price cards (no extra dependency beyond your tariff app)
1. **Every time your tariff app reports a new price** → EcoFlow STREAM → **Set current electricity
   price** → `[price]` (use the tariff app's price token/logic variable). Set the display unit under
   the STREAM device's settings (`p/kWh`, `ct/kWh`, …).
2. The STREAM device then shows an **Electricity price** tile, the **Energy Recommendation** widget
   reflects it, and these conditions become available:
   - **Electricity price is above / below `X`**
   - **Electricity price is negative** (you're paid to consume)

### Example: charge when the price is cheap
**When** your tariff app's price changes → **And** EcoFlow STREAM *Electricity price is below* `X`
→ **Then** EcoFlow STREAM → **Prepare for cheap grid import** → reserve `100%`.

### Example: grab a negative-price event
**When** your tariff app's price changes → **And** EcoFlow STREAM *Electricity price is negative*
→ **Then** EcoFlow STREAM → **Prepare for cheap grid import** → reserve `100%` (fill the battery
while the grid pays you). This should take precedence over any solar/self-consumption logic.

---

## Legacy recipes (using a separate Octopus/Tibber app's own condition cards)

The recipes below use the STREAM Flow cards together with your tariff app's **own** price
conditions (e.g. the Octopus Energy or Tibber Homey app). They rely only on the controls the
EcoFlow open API exposes — operating mode, backup-reserve target, charge/discharge SoC limits and
grid feed-in — because the API has **no direct charge/discharge watt setpoint**.

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
| Set backup reserve | Action | Reserve floor 3–100% |
| Set charge limit / Set discharge limit | Action | Max charge SoC / min discharge SoC |
| Set grid feed-in | Action | Export on/off |
| Battery level is above/below | Condition | Gate any flow on SoC |
| Solar power is above | Condition | Gate on live PV |
| Operating mode is | Condition | Gate on current mode |

> Tip: combine the **Battery level** condition with the Octopus price triggers to avoid
> charging an already-full battery or exporting below your reserve.

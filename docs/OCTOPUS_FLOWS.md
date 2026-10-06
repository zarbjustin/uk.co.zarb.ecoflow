# Tariff-aware STREAM Flows (provider-agnostic)

These recipes describe policy settings for original BK STREAM installations,
not 5000 controls or guaranteed physical charging/export. The app is
**provider-agnostic**: it doesn't fetch prices itself, so it works with **any** tariff app in
**any** region — feed your current price in from the tariff app you already use (Octopus Agile,
**Tibber**, **aWATTar**, ENTSO-E, etc.).

The unpublished [Sprint 4 candidate](SPRINT_4_CONTROL_SAFETY_STATUS.md) adds fresh
command readback and price freshness below; published Test v1.10.18 does not yet
include that safety increment. Validate power response and normal-state recovery
on your installation before automating. Commands do not specify watts.

## Native price cards (no extra dependency beyond your tariff app)
1. **Every time your tariff app reports a new price** → EcoFlow STREAM → **Set current electricity
   price** → `[price]` (use the tariff app's price token/logic variable). Set the display unit under
   the STREAM device's settings (`p/kWh`, `ct/kWh`, …).
2. The STREAM device then shows an **Electricity price** tile, the **Energy Recommendation** widget
   reflects it, and these conditions become available:
   - **Electricity price is above / below `X`**
   - **Electricity price is negative** (you're paid to consume)

For the Sprint 4 candidate, feed the **currently applicable** price at least
hourly, in the configured units, and again after app restart or changing units.
Both price conditions reject missing or more than 90-minute-old session prices
with a Flow error, including inverted conditions. The tile/widget can retain the
last number and is not a freshness indicator. Expiry does not stop charging or
undo earlier settings. Use explicit window-exit/failure handling that does not
depend solely on a possibly expired price condition. Another tariff app's own
conditions have that app's freshness semantics, not this safeguard.

### Example: charge when the price is cheap
**When** your tariff app's price changes → **And** EcoFlow STREAM *Electricity price is below* `X`
→ **Then** EcoFlow STREAM → **Prepare for cheap grid import** → reserve `100%`.

### Example: grab a negative-price event
**When** your tariff app's price changes → **And** EcoFlow STREAM *Electricity price is negative*
→ **Then** EcoFlow STREAM → **Prepare for cheap grid import** → reserve `100%` (fill the battery
if permitted by EcoFlow's mode/schedule and device limits). Choose one automation
authority; do not run conflicting solar, AI and tariff policies together.

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

This lifts the charge limit to 100% and sets the backup-reserve target. Whether
the battery charges from the grid depends on its operating mode, schedule and
device/grid constraints. Read back settings and observe actual power separately.

## 2. Restore normal policy when the window ends
**When:** Octopus Agile *price is above* `X p/kWh`.
**Then:** restore the previous reserve, discharge limit, charge limit, feed-in
permission and operating mode through the existing actions, as appropriate.
Record these first; `20%` reserve and `80%` charge limit are examples, not universal
defaults. The reserve helper can lower the discharge limit; reserve alone is not
a complete restore or a guaranteed stop/idle command. Lower discharge first if
needed, restore reserve with its required margin, then restore the prior discharge
limit. Turn feed-in off first if returning to an off state; enable it only after
the limit changes. Inspect EcoFlow before recovery from a partial failure.
No automatic rollback or user-facing restore action is provided. Include a known
window-end/failure route even if the tariff feed stops.

## 3. Export / discharge during the peak
**When:** Octopus Agile *price is above* `Y p/kWh` (peak), **and** (condition)
EcoFlow STREAM → **Battery level is above** `30%`.
**Then:** EcoFlow STREAM → **Prepare for peak / export** → reserve `10%`.

Lowers reserve and enables grid feed-in permission. It does not force discharge
or export at a particular power; verify actual response and applicable constraints.

## 4. Protect a morning reserve
**When:** time is `05:30`.
**Then:** EcoFlow STREAM → **Set backup reserve** → `50%` so you keep enough for the
morning as a policy target, subject to device operation; not a capacity guarantee.

## 5. Self-powered by day, scheduled by tariff at night
- **When** sunrise → **Set operating mode** → `Self-powered`.
- **When** sunset → **Set operating mode** → `Time-of-use` (or `Scheduled`).

These mode actions do not configure a complete schedule. Check the schedule and
EcoFlow AI conflicts separately. External rooftop solar (for example Enphase)
is not necessarily STREAM MPPT telemetry: use explicit external solar/grid
measurements, validate their sign and whether they include the battery, and apply
a deadband/dwell time and stale-signal handling to avoid rapid toggling. The app
does not implement that external policy or a minimum-charge-wattage target.

---

### Card reference
| Card | Type | What it does |
| --- | --- | --- |
| Prepare for cheap grid import | Action | Charge limit → 100% + backup reserve → chosen %; physical charge is not guaranteed |
| Prepare for peak / export | Action | Backup reserve → chosen % + grid feed-in permission on; no wattage guarantee |
| Set operating mode | Action | Self-powered / AI / Scheduled / Time-of-use |
| Set backup reserve | Action | Reserve floor 3–100% |
| Set charge limit / Set discharge limit | Action | Max charge SoC / min discharge SoC |
| Set grid feed-in | Action | Export on/off |
| Battery level is above/below | Condition | Gate any flow on SoC |
| Solar power is above | Condition | Gate on live PV |
| Operating mode is | Condition | Gate on current mode |

> Tip: combine the **Battery level** condition with the Octopus price triggers to avoid
> charging an already-full battery or exporting below your reserve.

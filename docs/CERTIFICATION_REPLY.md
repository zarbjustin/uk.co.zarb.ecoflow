# Certification reply — standalone-app justification

Context: Homey App Review flagged device overlap with Marcus Valk's
"EcoFlow - Portable power stations" (`com.ecoflow.ecoflowpro`), which already lists the
STREAM models, and asked us to either merge/PR into that app or justify a standalone app.

Marcus's app supports: Delta PRO / PRO Ultra / PRO 3, Delta 2 / 2 Max / Max, PowerStream,
Smart Home Panel, Smart Plug, and Stream AC PRO / PRO / AC / Max / Ultra / Ultra X.
The overlap is real on the STREAM models, so the case below argues on **focus and design
intent**, not device exclusivity.

---

## Reply to paste into the review thread

**Subject: RE: EcoFlow STREAM Series — clarification on a standalone app**

Hi, and thank you for the thorough review and the kind words on the documentation.

You're right that there's device overlap with Marcus Valk's "EcoFlow - Portable power
stations" — his app does list the STREAM models. I'd still like to respectfully make the
case for a standalone app, on the basis of **focus and design intent** rather than device
exclusivity.

**1. A focused single-product-line app vs. a broad catalogue.** Marcus's app spans
EcoFlow's portable power range (Delta series), PowerStream, Smart Plug, Smart Home Panel
*and* STREAM. Mine is deliberately scoped to **one product line — the fixed-installation
STREAM balcony-solar/battery system** and its Smart Meter. PowerStream and portable
stations are intentionally excluded (PowerStream is removed from the shipped app). The
result is an app whose every device, setting and Flow card is tailored to a STREAM
home-energy installation, with no portable-power concepts to navigate.

**2. Energy-native design is the core purpose.** The app is built so STREAM is a
first-class part of **Homey Energy**, not just a controllable device:
- the STREAM system registers as **home battery storage** with cumulative charged/discharged
  meters;
- the EcoFlow **Smart Meter** registers as the **grid meter** (cumulative import/export);
- STREAM solar registers as **solar production**.

So STREAM contributes correctly to the Homey Energy dashboard and balance. On top of that I
expose energy-decision Flow cards (operating mode, backup reserve, charge/discharge SoC
limits, grid feed-in) and grid/solar triggers and conditions. **My core requirement, and
the reason I built this, is to drive STREAM charge/discharge automatically from Octopus
Energy Agile half-hourly prices via Homey Flow** — tariff-aware home-energy optimisation.
That Energy-first, tariff-driven design is the value the app is built around, and it's
modelled specifically on Homey's Energy spec for this fixed-installation use case.

I haven't previously collaborated with Marcus and have no prior relationship with him. I'm
genuinely open to a conversation about how this STREAM-specific Energy integration could
benefit users — including contributing ideas upstream — but I believe a focused,
clearly-named app ("EcoFlow STREAM Series") is the clearest experience for owners of this
specific product, especially those (like me) using it for tariff-based automation.

I'm happy to provide a test account or a live screen-share so you can see the Energy
dashboard integration and the Octopus-driven Flows working end-to-end.

Thank you for considering this, and for the kind offer to help put me in touch with Marcus.

Best regards,
Justin Zarb

---

## Supporting evidence (from this repo)

| Claim | Where it's proven |
| --- | --- |
| STREAM-only scope | Drivers: `stream`, `stream_unit`, `stream_solar`, `stream_micro`, `stream_socket`, `smartmeter`. PowerStream sits in `disabled-drivers/powerstream/` (not shipped). |
| Home battery in Energy | `drivers/stream/driver.compose.json` → `energy.homeBattery: true` + `meter_power.charged/.discharged`. |
| Per-unit battery | `drivers/stream_unit` → `energy.batteries: ['INTERNAL']`. |
| Grid meter in Energy | `drivers/smartmeter` → `energy.cumulative` + `meter_power.imported/.exported`. |
| Solar production in Energy | `drivers/stream_solar` & `drivers/stream_micro` → `meterPowerExportedCapability`. |
| Energy-decision Flow cards | Actions: `set_operating_mode`, `set_backup_reserve`, `set_charge_limit`, `set_discharge_limit`, `set_feed_in`. Triggers/conditions: `grid_import_started`, `grid_export_started`, `grid_power_changed`, `is_charging`, `is_exporting`, `operating_mode_is`, `solar_power_above`. |

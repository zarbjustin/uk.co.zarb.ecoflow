# EcoFlow STREAM → Homey Energy: Full-Integration Roadmap

Status: planning · Target: make STREAM a first-class Homey **Energy** integration
(battery + solar + grid + control), grounded in the Homey Energy spec
(<https://apps.developer.homey.app/the-basics/devices/energy>) and verified against
a live EcoFlow account.

### Implementation status
- ✅ **Sprint 14a** — `stream` device now declares `energy.homeBattery:true` with
  `meterPowerImported/ExportedCapability` (charged/discharged).
- ✅ **Sprint 15** — shared monotonic energy core (`lib/energyIntegration.ts`:
  `integrateSignedPower`, `integratePositivePower`); Smart Meter reuses it.
- ✅ **Sprint 16 (core)** — battery `meter_power.charged/.discharged` are now
  integrated locally from `powGetBpCms` (REST has no lifetime counter) and
  persisted monotonically.
- ✅ **Sprint 17 (core)** — new `stream_solar` (`solarpanel`) device: `measure_power`
  = total PV (≥0), `meter_power` = locally-integrated generation.
- ⏳ Next: controller split + migration (Sprint 18), `target_power_mode` (19),
  `target_power` spike (20), extras (21), publish (22).


This roadmap was produced with a **multi-model** pass (GPT‑5.4 + Gemini 3.1 Pro +
Sonnet 4.6, synthesised by Opus 4.8) and reconciled with live‑API probes of a real
STREAM Ultra X / AC Pro / Smart Meter installation.

> **Quick win first (Sprint 14a, ~1 hour):** the shipped `stream` device declares
> `energy.batteries:["INTERNAL"]` (a *replaceable* battery, like a vacuum) instead
> of `energy.homeBattery:true`. Until that changes, Homey Energy never treats the
> STREAM as home storage. Flip it to `homeBattery:true` (+ wire
> `meterPowerImportedCapability`/`meterPowerExportedCapability`) as a low‑risk,
> high‑value first commit, independent of the larger device split below.

---

## 0. Guiding principles (from the Homey Energy spec)

- **One hardware = many Homey devices.** Homey *requires* multi‑function hardware
  (battery + solar + meter) to be split into **separate devices, one per energy
  class**. A single device may not be battery *and* solar *and* meter.
- **Energy classes & sign conventions:**
  | Function | `class` | `energy` config | `measure_power` sign |
  |---|---|---|---|
  | Home battery | `battery` | `homeBattery:true` + `meterPowerImportedCapability`/`meterPowerExportedCapability` | **+ charging / − discharging** |
  | Solar | `solarpanel` | `meterPowerExportedCapability` (cumulative generated) | **+ generating** |
  | Grid meter | `sensor` | `cumulative:true` + `cumulativeImported/ExportedCapability` | **+ import / − export** |
  | Controller / load | `other` | **none** (informational only) | n/a |
- **Cumulative `meter_power` must be monotonic** (never decrease) or Homey Energy
  graphs corrupt.
- **Don't model home load as an Energy meter.** Homey derives consumption from
  grid + battery + solar. A `meter_power` load device would double‑count. Load is
  informational only.
- **`target_power` / `target_power_mode`** (Homey ≥ 12.13.0) let Homey actively
  control charge/discharge and solar curtailment. `target_power`: + = charge /
  − = discharge (battery) or production cap (solar); range must include 0;
  `excludeMin/excludeMax` = dead zone. `target_power_mode`: `homey` (Homey
  controls) vs a device‑owned mode.

---

## 1. Critical live-API findings (constrain the design)

Verified against the live EU account (`api-e.ecoflow.com`) this cycle:

1. **The system "main" SN aggregates the whole installation.** `device/system/main/sn`
   groups all inverters (4× AC Pro + 2× Ultra X here) under one main SN
   (`BK61…0041`). Only that SN's `quota/all` carries whole‑home aggregates.
2. **REST `quota/all` is sparse — only ~15 keys.** It returns: `cmsBattSoc`,
   `powGetBpCms`, `powGetPvSum`, `powGetSysGrid`, `powGetSysLoad`,
   `gridConnectionPower`, `cmsMaxChgSoc`, `cmsMinDsgSoc`, `backupReverseSoc`,
   `feedGridMode`, `relay2Onoff`, `relay3Onoff`,
   `energyStrategyOperateMode.operate{SelfPowered,IntelligentSchedule}Open`,
   `quota_cloud_ts`.
3. **Rich fields are NOT in REST.** `accuChgEnergy`, `accuDsgEnergy`,
   `powGetSchuko1/2`, `powGetSysLoadFrom*`, `temp`, `vol`, `cycles`, `soh`,
   per‑PV `plugInInfoPv*`, and fault codes returned **empty** from both
   `quota/all` and an explicit `POST device/quota` field request.
   → **Implication:** cumulative charged/discharged/solar kWh must be
   **integrated locally** from instantaneous power (we cannot read lifetime
   counters over REST). Health/socket/PV telemetry is only viable if **MQTT**
   delivers it (must be verified — see Sprint 14).
4. **History API codes are rejected (1006).** `BK621/BK611/BK61` all return
   "code is incorrect" for this Ultra X system → the daily‑energy feature's model
   prefix is wrong/unknown for newer models. Daily stats need a verified prefix
   or should be hidden.
5. **Smart Meter's own SN returns an empty quota** — its reading is `powGetSysGrid`
   on the main SN (already handled by the shipped grid‑meter fix).
6. **Battery power sign is confirmed.** Live: `powGetBpCms = +1237 W` while the
   battery was charging (`cmsBattSoc=20`), and the energy balance is consistent
   (PV 2437 + grid 2769 = load 3969 + battery 1237 = 5206 W). So **positive =
   charging**, matching Homey's home‑battery convention — no inversion needed.

> These findings refine the AI plans: **don't assume `accu*Energy` or history are
> available.** Audit the real data surface first, integrate energy locally, and
> guard every capability that may be empty.

---

## 2. Target device family (per main SN)

| Driver | Class | Energy role | Source |
|---|---|---|---|
| `stream_battery` *(new)* | `battery` | `homeBattery` + charged/discharged meters | main SN |
| `stream_solar` *(new)* | `solarpanel` | cumulative generated | main SN |
| `smartmeter` *(shipped)* | `sensor` | cumulative grid import/export | `powGetSysGrid` on main SN |
| `stream_controller` *(new)* | `other` | **none** (load, controls, modes, history, faults) | main SN |
| `stream_unit` *(shipped)* | `other` | none | per‑inverter SN |
| `stream_socket_1/2` *(later, optional)* | `socket` | own metering | `powGetSchuko*` / relays |
| `stream` *(legacy)* | `battery` | deprecated → migrated away | — |

Rationale: battery + solar + grid as three Energy devices is exactly Homey's
model; the controller holds everything that must **not** participate in Energy
accounting (load, AC outputs, operating mode, feed‑in, daily history, faults).

---

## 3. Sprint plan

### Sprint 14 — Data‑surface audit + family/migration scaffolding
**Goal:** Know exactly what the API (REST **and** MQTT) provides, and lay the
migration plumbing — before splitting devices.
- **Tasks**
  - Build a diagnostic that records a full MQTT quota burst for the main SN and
    diffs it against REST `quota/all`. Confirm whether `accu*Energy`, `temp`,
    `soh`, `cycles`, `powGetSchuko*`, per‑PV, `powGetSysLoadFrom*`, fault codes
    appear over MQTT.
  - Decide the model‑code lookup for the history API (try to derive from SN/model;
    otherwise keep the manual override and hide daily stats when unknown).
  - Add a `StreamFamily` discovery module keyed by `mainSn` (reused by all new
    drivers).
  - Add store keys for migration: `mainSn`, `familyRole`, `legacyDeviceId`,
    monotonic‑meter seeds.
- **Risks:** MQTT may also be sparse; if so, health/PV/socket features are
  hardware‑limited and must be marked unavailable rather than shown empty.
- **Acceptance:** a written "data availability matrix" (field → REST/MQTT/none)
  committed to `docs/`; family grouping unit‑tested.

### Sprint 15 — Monotonic energy core
**Goal:** A reusable, reset‑proof cumulative‑energy engine (we must integrate,
not read, lifetime counters).
- **Tasks**
  - Generalise the Smart Meter's `accumulateEnergy` into a shared
    `MonotonicMeter` util: integrates signed power → import/export Wh, persists to
    store, guards against null/zero dropouts and oversized gaps, and **only ever
    increases**.
  - If MQTT *does* expose `accu*Energy`, add an "anchor + delta" mode that follows
    the device counter but absorbs firmware resets (never steps backward).
  - Seed counters from any legacy `meter_power.charged/.discharged` on migration.
- **Acceptance:** unit tests for integration, reset absorption, reboot
  persistence, monotonicity; reused by battery, solar and grid devices.

### Sprint 16 — Home Battery device
**Goal:** Ship a proper Homey **home battery**.
- **Homey config:** `class:battery`; `energy:{ homeBattery:true,
  meterPowerImportedCapability:"meter_power.charged",
  meterPowerExportedCapability:"meter_power.discharged" }`.
  Capabilities: `measure_battery`, `measure_power` (+chg/−dsg),
  `meter_power.charged`, `meter_power.discharged`, plus (MQTT‑gated)
  `measure_temperature`, `measure_voltage`, `battery_soh`, `battery_cycles`,
  `charge_remaining`, `discharge_remaining`, `backup_reserve_soc`,
  `charge_limit`, `discharge_limit`.
- **EcoFlow mapping:** `cmsBattSoc→measure_battery`; `powGetBpCms→measure_power`;
  `meter_power.charged/.discharged` via `MonotonicMeter(powGetBpCms)` split by
  sign; limits from `cmsMaxChgSoc/cmsMinDsgSoc`; reserve from `backupReverseSoc`.
- **Risks:** sign of `powGetBpCms` must be confirmed on charge **and** discharge.
- **Acceptance:** appears in Energy as a home battery with separate
  charged/discharged meters; SoC + power live; survives reboot.

### Sprint 17 — Solar device
**Goal:** Ship a proper Homey **solar panel**.
- **Homey config:** `class:solarpanel`; `energy:{ meterPowerExportedCapability:"meter_power" }`;
  caps `measure_power` (clamped ≥ 0), `meter_power` (generated), optional
  per‑PV `measure_power.pv1..4` (MQTT‑gated).
- **EcoFlow mapping:** `powGetPvSum→measure_power`; fallback per‑PV
  `plugInInfoPvNAmp*Vol`; `meter_power` = `MonotonicMeter` of generation,
  reconciled with history `solarWh` *if* a valid history code is found.
- **Acceptance:** Energy shows generation only; night‑time clamps to 0; meter
  monotonic across day rollover.

### Sprint 18 — Controller device + migration rollout
**Goal:** Move all **non‑Energy** telemetry/controls off the legacy device.
- **Homey config:** `class:other`, **no energy config**. Caps:
  `measure_power.load`, `measure_power.from_pv/from_battery/from_grid`,
  `onoff.ac1/ac2`, `operating_mode`, `feed_in_control`, the `energy_*_today`
  history caps, `alarm_generic` (fault).
- **EcoFlow mapping:** `powGetSysLoad`, `powGetSysLoadFrom*`, `relay2/3Onoff`,
  `feedGridMode`, `energyStrategyOperateMode.*`, history API, fault codes.
- **Migration:** prefer **additive, non‑destructive** migration — on app start, for
  each legacy `stream` device create the missing battery/solar/controller
  companions, copy zone/name/settings, seed meters; **don't remove capabilities
  from already‑paired devices**. Then mark the legacy device deprecated (hidden
  from new pairing via `"showInViews": false`) with a repair/notice prompting
  removal.
- **Acceptance:** an already‑paired home auto‑gains the 3 companions without
  losing history; controls/history mirrored; **no double counting** in Energy.

### Sprint 19 — Compatibility bump + `target_power_mode`
**Goal:** Clean control‑ownership semantics before any watt control.
- **Tasks:** bump `compatibility` `>=12.4.0` → `>=12.13.0`. Add
  `target_power_mode` to battery & solar with **custom values**
  `["homey","self_powered","ai","scheduled","tou"]`. Leaving `homey` restores the
  device strategy and discards any pending Homey setpoint.
- **Mapping:** the non‑`homey` modes map 1:1 to
  `cfgEnergyStrategyOperateMode.operate{SelfPowered,IntelligentSchedule,Scheduled,Tou}Open`.
- **Risks:** the bump drops pre‑12.13 Homeys; announce it.
- **Acceptance:** mode round‑trips over MQTT; auto‑generated mode Flow cards work;
  `homey app validate --level publish` green.

### Sprint 20 — `target_power` (gated by a hardware/API spike)
**Goal:** Honest watt‑level control — only if the API truly supports it.
- **Spike first:** confirm whether STREAM exposes a real charge/discharge **watt
  setpoint** (or solar curtailment cap). This is the single biggest unknown — the
  open API may only offer reserve‑SoC + mode + feed‑in, not arbitrary watts.
- **If supported:** add `target_power` (battery `min=−maxDischargeW … max=+maxChargeW`,
  include 0; solar `0…maxSolarW`, 0 = full curtail, max = none) mapped to the
  verified command.
- **If not supported:** ship `target_power_mode` only; keep `target_power`
  **experimental**, approximating via `cfgBackupReverseSoc` + `cfgFeedGridMode`
  and **rejecting** unsupportable setpoints with a clear error (never fake
  precision).
- **Acceptance:** stable `target_power` only ships if proven on hardware; otherwise
  beta‑flagged with tests proving unsupported values throw.

### Sprint 21 — Extras: sockets, SoC‑limit writes, faults, health, widgets
**Goal:** Expose the remaining valuable surface (availability‑gated).
- Optional `stream_socket_1/2` (`class:socket`, `onoff` + `measure_power` from
  `powGetSchuko*`/relays) — only if MQTT provides per‑socket power.
- Writable charge/discharge SoC limits (`cmsMaxChgSoc/cmsMinDsgSoc`) — verify
  write params on hardware.
- Fault → `alarm_generic` + Flow triggers ("Inverter error", "Battery error").
- Battery health/cycles into Insights.
- Dashboard **widgets**: Battery (SoC + flow), Solar (today/now), Home Load.
- Flow cards: "Set reserve SoC", "Set operating mode", "Set feed‑in",
  price‑aware hooks ("when spot price < x → mode/reserve").

### Sprint 22 — Multi‑system hardening, QA & publish
**Goal:** Production‑safe, certifiable release.
- Multiple main SNs per account + standalone BK21 meters; auto history‑prefix
  detection with manual fallback.
- Migration guide + community post explaining the split.
- `build` / `test` / `lint` / `validate --level publish` all green; recorded‑fixture
  tests + one on‑hardware migration test; staged beta; CI publish.

---

## 4. Additional API-enabled features (beyond core Energy)

- **Per‑socket (Schuko) metering & control** as `socket` devices (if MQTT exposes
  `powGetSchuko*`).
- **Charge/Discharge SoC‑limit control** — make `charge_limit`/`discharge_limit`
  setable via `cfgMaxChgSoc`/`cfgMinDsgSoc` writes (verify params on hardware).
- **Operating‑mode / TOU / schedule exposure** via `target_power_mode` + Flow cards.
- **Fault & health monitoring:** error‑code alarms with both `fault_raised` **and**
  `fault_cleared` triggers, SoH, cycle count, temperature.
- **Microinverter (BK01) integration** — currently skipped (no REST telemetry);
  revisit if MQTT exposes data for it.
- **Price‑aware automation hooks:** set reserve/mode from a dynamic‑pricing app
  (e.g. force charge when prices are negative; stop export when prices are low).
- **Multi‑system support:** several STREAM installs and standalone meters per
  account.
- **Daily savings / CO₂ / self‑sufficiency** (once a valid history code is found),
  with optional gamification.

---

## 5. Recommended ordering & top risks

**Order:** 14 (audit + scaffolding) → 15 (monotonic core) → 16 (battery) →
17 (solar) → 18 (controller + migration) → 19 (`target_power_mode`) →
20 (`target_power`, gated) → 21 (extras) → 22 (publish). Foundation and a correct,
non‑double‑counting Energy split deliver the most value first; dynamic control
follows once data integrity is proven.

**Risk register**
1. **No watt setpoint (highest risk).** EcoFlow's open API likely lacks arbitrary
   battery watt control. Validate in the Sprint 20 spike; fall back to
   mode + reserve‑SoC + feed‑in and keep `target_power` experimental.
2. **Sparse REST surface / unknown MQTT richness.** Lifetime energy and
   health/PV/socket data may be unavailable; integrate energy locally and gate
   every uncertain capability (Sprint 14 settles this).
3. **Counter resets.** Firmware updates reset EcoFlow counters → the
   `MonotonicMeter` must absorb resets without backward steps.
4. **Migration friction.** Splitting one device into several rebuilds Flow cards;
   provide auto‑companion creation + a clear migration notice, and don't retype
   devices in place.
5. **Double counting.** Keep the Smart Meter as the only whole‑home grid meter and
   the load on a non‑Energy controller device.

---

## 6. Validation backlog (do on hardware)

- [ ] MQTT quota burst vs REST: which rich fields actually arrive?
- [x] `powGetBpCms` sign on charge — **confirmed positive while charging** (live
      +1237 W, consistent energy balance). Re‑confirm on discharge.
- [ ] A valid history `code` for Ultra X / AC Pro (daily stats).
- [ ] Whether a true charge/discharge **watt** command exists.
- [ ] Per‑socket power + relay control on hardware.
- [ ] Writable `cfgMaxChgSoc` / `cfgMinDsgSoc` / schedule params.

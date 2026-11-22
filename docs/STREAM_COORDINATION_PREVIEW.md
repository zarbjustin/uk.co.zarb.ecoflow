# STREAM coordination preview — advisory only

The separately opted-in selected-source settings workspace is now implemented
locally on the diagnostic branch; see COORDINATION_SOURCE_WORKSPACE.md for its
broad permission boundary, fixed GET-only adapter, timestamp limits and tests.
It does not activate this advice as a controller or Energy source.

## Circuit-aware continuation — 17 October 2026, LOCAL / UNPUBLISHED

Diagnostic branch only. No new build, version bump, controls, Energy activation,
Flow actions or automatic Homey-device lookup. The older SOC-only format below
remains compatible and now explicitly reports `surplusAssessed: false`. It is not
upgraded implicitly to a surplus/solar decision. See STATUS.md for release state.

`input.schemaVersion: 2` (or the presence of any v2 source) selects the stricter
circuit-aware path. Missing v2 data cannot fall back to the legacy policy.
External battery is generic: Fronius/BYD, Solis or another explicitly supplied
integration. Dual CT is NOT mandatory: a P1 or other whole-installation grid
source works without a secondary circuit. No sources are fetched automatically.

Shared circuit-role vocabulary, also used by existing Dual CT display settings:

| Role | Declared measurement meaning |
|---|---|
| `grid` | Whole-installation grid exchange |
| `solar_inverter` | Solar-only inverter branch exchange, not verified solar origin |
| `hybrid_inverter` | Combined solar and battery inverter exchange |
| `load` | One load branch, not whole-home demand |
| `unknown` | Unspecified; cannot qualify a supplied advisory circuit |

Descriptions never verify wire mappings/signs, infer battery SOC, select an Energy
source, add channels together or change the read-only driver's numeric readings.
The v2 endpoint consumes explicit caller inputs, NOT the display settings. Its
role/identity/direction assertions are rehearsal inputs, not trusted authority.

### V2 request shape

Use real reading timestamps in milliseconds, not the illustrative values below.
`input.now` is ignored by the app endpoint, which uses its own server clock.
`sourceKey` names a logical measurement source/circuit, `sessionKey` changes after
reconnect/restart, and `siteKey` binds all inputs to one installation. Keys are
runtime-only, 1-128 ASCII letters/digits/underscore/hyphen; not returned verbatim.
CT1/CT2 can share a physical meter, but must use different logical circuit keys.
Do not include credentials, addresses or serial numbers in these keys.

```json
{
  "input": {
    "schemaVersion": 2,
    "manualOverride": false,
    "controllerConflict": false,
    "otherSourcesReviewed": true,
    "circuits": {
      "grid": {
        "sourceKey": "grid-circuit", "sessionKey": "session-one", "siteKey": "site-one",
        "role": "grid", "scope": "whole_installation", "positiveMeans": "import",
        "powerW": { "value": -300, "at": 2000000 }
      },
      "secondary": {
        "sourceKey": "inverter-circuit", "sessionKey": "session-one", "siteKey": "site-one",
        "role": "hybrid_inverter", "scope": "branch", "positiveMeans": "to_house",
        "powerW": { "value": 900, "at": 2000000 }
      }
    },
    "externalBattery": {
      "sourceKey": "external-battery", "sessionKey": "session-one", "siteKey": "site-one",
      "soc": { "value": 98, "at": 2000000 },
      "powerW": { "value": 0, "at": 2000000 }
    },
    "streamBattery": {
      "sourceKey": "stream-battery", "sessionKey": "session-one", "siteKey": "site-one",
      "powerW": { "value": 0, "at": 2000000 }
    }
  }
}
```

Grid `positiveMeans` must explicitly be `import` or `export`. Secondary is optional;
when present it needs `hybrid_inverter`, `solar_inverter` or `load`, branch scope,
and explicit `to_house`/`from_house` polarity. No direction is inferred from role.
Both battery-power inputs use canonical positive = charging, negative = discharging;
callers must normalize their own integration's conventions first. `at` represents
the underlying reading observation, NOT the time this API is called. Receipt-only
timing is not certified measurement freshness by this advisory.

### Decision and continuity limits

- All supplied readings must be finite, individually younger than `maxAgeMs`,
  not future-dated, and within `maxSkewMs` of each other. Defaults: 60 seconds /
  5 seconds. Source aliases and different installations are rejected.
- Explicit manual/controller/other-source review is required. Separate external
  SOC/power and STREAM power are mandatory even when CT2 is a hybrid inverter.
- External battery has priority below start SOC; continuing advice uses stop
  SOC hysteresis. Active external charging, either battery discharging, opposing
  battery flows, grid import or insufficient measured grid export stop a candidate.
- Default minimum export: 100 W, power deadband: 20 W. These are research choices,
  not device ratings. Grid already includes branch flows. Never add CT2 output,
  subtract a load twice, or add STREAM battery watts to invent available AC power.
- A candidate requires 60 seconds of qualifying calls and cooldown. Calls must
  continue with gaps shorter than maxAge and advancing grid/external/STREAM power
  timestamps. Repeated cached values cannot advance dwell. For the defaults, call
  with fresh observations more often than once per minute; this code schedules
  nothing. Missing/partial/stale/conflicting data resets the waiting period.
- Source/session/site/role/polarity/topology/policy changes reset dwell and any
  held candidate. Old legacy state cannot qualify v2. Only hashed context and
  bounded status/timestamps are returned, not raw identifiers or supplied watts.
- `review_candidate` means observed export is worth reviewing, NOT permission to
  charge. No charge-watt target is generated. Export can come from other sources;
  `solarOriginVerified` always stays false. `otherSourcesReviewed` is a caller
  assertion, not independent verification. Unmonitored batteries remain a risk.
- Unlike a regulating controller, advice withdraws when measured export falls
  below threshold, even if STREAM may already be legitimately using surplus.
  It deliberately does not infer charging headroom from battery-side watts.
- Caller-owned previous state/fingerprints can be forged and do not prove a real
  dwell or controller ownership. Never use this endpoint as command authorization,
  overload protection, persistent controller state or an automatic Flow action.

Results remain `advisoryOnly: true`, `controlsEnabled: false`, `commandWrites: 0`,
`contributesToEnergy: false`. The driver does not invoke this advisory, consent
does not activate controls/Energy, and no hardware/API writes are introduced.

## Legacy SOC-only request

This is a stateless advisory API, not a battery controller or Flow action. It
does not read Homey devices, fetch EcoFlow/BYD data, store settings or send commands.
Release availability must be checked in STATUS.md; this section describes the
older request format, not a current Test-version claim.

`POST /coordination-preview` accepts `input`, optional `previous` and optional
`policy`. Use the ordinary authenticated Homey app API; this is not a public
EcoFlow endpoint. Inputs must come from an explicitly configured integration.

Example shape (replace each example timestamp with the actual reading time in
milliseconds; refresh all readings before each call). The endpoint uses its own
server clock and ignores a supplied `input.now`:

```json
{
  "input": {
    "manualOverride": false,
    "controllerConflict": false,
    "bydSoc": { "value": 98, "at": 2000000 },
    "bydBatteryW": { "value": 0, "at": 2000000 },
    "streamBatteryW": { "value": 0, "at": 2000000 }
  }
}
```

Positive battery watts mean charging; negative mean discharging. Unknown controller
ownership blocks the preview. Do not assert `false` unless ownership/manual state
is actually known. Feed the prior response back as `previous` on the next call;
discard it after restart or loss of input continuity. This caller-owned state is
not trustworthy command authorization or proof that a dwell really occurred.

Outputs are `blocked`, `waiting` or `review_candidate`. Every response includes
`advisoryOnly: true`, `controlsEnabled: false` and `commandWrites: 0`. A candidate
means review the available surplus and control contract, **not** start charging.
No grid/surplus sensor is evaluated and no physical idle/stop is enforced.

Default research policy: start SOC 98%, stop SOC 97%, 60-second dwell and cooldown,
maximum input age 60 seconds, power deadband 20 W. These are configurable policy
choices, not manufacturer recommendations. Start/stop must be in 0–100 with stop
below start. Durations are limited to 1 second–24 hours; deadband is >0–10,000 W.
The input power sanity bound of 100,000 W is not an electrical/control rating.

Missing, stale, future or invalid readings, opposing battery flows, BYD discharge,
invalid clock/state and controller conflicts block the preview even after a prior
candidate. Blocking an advisory cannot physically stop a battery. A separate
verified controller and recovery contract are still required before automation.

## Local support report (schema 5)

The existing Settings report now includes per-device 5000 assessments: recent
configuration receipts versus application/physical verification, active task
observations, disabled scheduling/control authority, and fresh mixed-family peer
evidence. It does not average SOC, add capacity, infer membership or merge devices.

Cached product hints now list category-specific missing evidence. Expansion hosts
need inclusion/capacity-unit validation; Gateway/meters need measurement scope;
STREAM 3000 needs its own adapter and energy-direction validation. These hints
do not admit pairing or create Energy sources. Existing counters/identities and
installation-only Homey Energy roles are unchanged.

## Still gated

Hardware pilot, safe model-specific command limits, zero/PV semantics, linked-system
scope, correlated readback, measured response and recovery remain pending. ES21
does not inherit an ES22 input-write contract. New product adapters and mixed-system
aggregation require actual identity/membership captures, not this report alone.

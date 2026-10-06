# STREAM coordination preview — development branch only

This is a stateless advisory API, not a battery controller or Flow action. It
does not read Homey devices, fetch EcoFlow/BYD data, store settings or send commands.
It is not included in the current community Test build (v1.10.21 / build 36).

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

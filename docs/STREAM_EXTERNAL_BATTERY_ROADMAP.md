# External PV, load and battery coordination roadmap

## Release-hardening follow-up — 17 October 2026

The original source workspace and six observation cards reached Test v1.10.55.
The current four-sprint local wave covers recovery, combined replay/upgrade
checks, source/permission UX and release scope/commissioning. It is not published.
See RELEASE_CANDIDATE_CHECKLIST.md, COORDINATION_SOURCE_AUDIT.md and
STREAM_CONTROL_CONTRACT_AUDIT.md. No further planned Robert capture, new
charging writer, Energy activation, mainline merge or publication. Historical
"local/unpublished" descriptions below refer to the earlier sprint checkpoints.

17 October 2026. Diagnostic-branch plan, not permission to enable controls,
Energy, publish or alter installed devices. Robert/Ed's requirements are design
inputs; future hardware gates use owner equipment, not another planned export.

## Current increment — circuit roles and advisory logic

Shared explicit roles, generic external-battery telemetry, whole-grid observation,
optional PV/hybrid/load branch, source/site/session binding, individually fresh
readings, timed export/priority/cross-flow checks and reason-coded advice. Existing
Dual CT description settings remain compatible. P1 can supply grid observations;
Dual CT is not a purchase prerequisite. Hybrid throughput is never pure PV.

Implemented locally with synthetic regressions. Caller-supplied state is not
command authority. No automatic telemetry collection, Flow action, controller,
Energy activation or publication. See STREAM_COORDINATION_PREVIEW.md.

## Sprint A — visible read-only coordination explanation

Implemented locally, unpublished. The EN/DE/NL settings workspace and synthetic
desktop/mobile checks are described in COORDINATION_SOURCE_WORKSPACE.md. No
installed-host or hardware acceptance is claimed.

- Provide a separately opted-in settings rehearsal showing circuit roles and
  concise waiting/blocked/review reasons. Distinguish unknown, zero and stale.
- Show receipt/reading timing and scope without raw identifiers; explain why
  hybrid solar/battery output cannot independently prove surplus solar.
- Keep the existing preview unchanged by default and avoid new captures/exports.
- Acceptance: desktop/mobile accessibility, missing-data/reconnect/UI regressions,
  no numeric support-export expansion and no command or Energy path.

## Sprint B — explicit read-only source bindings

Implemented locally for generic numeric Homey capability contracts. Cross-app
permission preparation was explicitly approved; it is not deployed. No named
vendor's device contract or physical scope has been verified on hardware.

- User chooses one authoritative grid observation (P1 or Dual CT) and separate
  external SOC/battery-power and STREAM-power sources. No silent inventory scan.
- Define normalized units/signs, installation membership, source timestamps,
  firmware/model evidence, permissions, revocation and reconnect/session resets.
- Support Fronius/BYD and Solis via their actual Homey capability contracts,
  not assumptions from marketing names. Separate reported/candidate/verified data.
- Acceptance: synthetic multivendor traces, changed/removed devices, stale SOC,
  alternate signs, simultaneous flows and source-overlap negative tests. No
  telemetry binding is trusted merely because a user selected a circuit label.

## Sprint C — charging-control contract research (no writes)

- Audit ES21/ES22 separately for charge ceiling, AC charging-input limit, pause /
  resume semantics, reserve constraints, schedules and installation/unit scope.
- Establish which settings can permit charge/discharge versus force it; preserve
  original settings and define readback/recovery before proposing a writer.
- Do not equate a reduced SOC ceiling with pause, zero input with blocked direct
  PV, or configuration readback with a physically stopped linked installation.
- Acceptance: pinned official/upstream evidence and bounded test plans per model.
  Missing contracts stay gated. Requires separate approval for future commands.

## Sprint D — owner-hardware commissioning and shadow soak

- Compare grid, each phase, PV-only/hybrid/load branch, external battery and
  linked STREAM installation during normal charge/discharge/idle transitions.
- Test startup, reconnect, missing packets, realistic timestamps and safe session
  continuity; compare advisory decisions without issuing commands.
- Establish a bounded, explicitly approved control pilot only after Sprint C,
  with manual override, settings backup, measured response and restoration.
- Acceptance: source/scope/sign/freshness and actual pause/resume validated on
  each supported model, no cross-charging and no conflict with native automation.
  Passing software tests alone is not this gate.

## Sprint E — opt-in Flow coordination, separately approved

Observation-only sub-sprints 1/2 are implemented locally under new explicit owner
approval; see COORDINATION_FLOW_OBSERVATIONS.md. Six WHEN/AND cards and a separate
temporary read-only monitoring lease do not enable the control work below.
Known Dual CT preview candidates remain excluded from Flow monitoring. No
publication or installed/hardware acceptance is claimed.

- Expose verified model-specific actions and advisory conditions separately.
  Implement persistent controller ownership, authenticated continuity and recovery
  rather than using the stateless preview's caller-owned previous result.
- Add SOC hysteresis, stable surplus, rate/dwell limits, external-discharge veto,
  manual stop, competing-controller arbitration and conservative failure handling.
- Commission with owner hardware before a small controlled Test pilot; no silent
  schedule overwrite, default enablement or existing-device conversion.
- Acceptance: restart/crash recovery, lost readback, partial linked-system writes,
  override precedence and rollback physically exercised. Fresh approval needed.

## Parallel Energy track — independent of charging coordination

Grid import/export needs verified mapping/sign/timing, explicit new-source
adoption and duplicate-meter checks. Solar-only branch energy needs separate
generation evidence and must not count hybrid battery discharge as solar. A load
branch is a subset of household demand, never an additional whole-home meter.
Counter scaling/period/reset and power-derived estimates stay separate. Existing
devices remain excluded unless a future explicitly approved migration changes
that boundary. See DUAL_CT_GRID_ENERGY_PREPARATION.md and release gates.

No automatic overload-protection controller is proposed: cloud/Homey advisory
latency is not electrical protection. Existing protective equipment and EcoFlow
native protection remain responsible for that function.

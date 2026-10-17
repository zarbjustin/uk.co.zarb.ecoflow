# Dual CT circuit and phase presentation — 17 October 2026

Local diagnostic-branch continuation only. Not published. Mainline, Live,
existing meter/battery accounting, API commands and Energy adoption unchanged.

## Documentation and expectations

Reviewed the [official product page](https://eu.ecoflow.com/products/smart-meter-dual-ct?variant=54090477306199)
and [V1.1 user manual](https://ecoflow-service-us-prod.oss-us-west-1.aliyuncs.com/cms/upload/1789028990939/EcoFlow%20Smart%20Meter%20Dual%20CT%20User%20Manual.pdf),
English printed pages 2–6, including diagrams. Dual CT has two three-phase CT
circuits, six clamps in total. CT2 is optional. The diagram shows CT1 at the grid
and CT2 at a third-party inverter; the product page also permits a load circuit.
A hybrid inverter's circuit can include solar AND battery exchange. Measuring
that wire cannot identify its separate internal sources. Neither document is a
model-421 protobuf contract or establishes telemetry timing, counter scaling,
period/reset origin, a local API or a remotely writable overload-protection API.
STREAM 5000 is explicitly excluded from the manual's wired RS485 connection step.

Community descriptions/screenshots support separate signed phase sums and
separate circuit totals on one installation. Do not generalise its topology,
phase order or direction to all meters. No screenshots, numeric customer data,
identities or diagnostic attachments are stored here. Tests use generated values.

## Local implementation

- Add 18 custom, get-only native phase displays: power W, voltage V and current A
  for three candidate positions in each CT group. These make individual values
  readable without parsing one long string. Phase positions 1/2/3 are not proof
  of physical L1/L2/L3 or EcoFlow A/B/C ordering on every installation.
- Keep every previous capability ID. Six technical string groups now show one
  explicitly numbered phase per line, with wire IDs, full sign-preserving display
  formatting and each field's own receipt age. Native cards retain numeric cache
  precision; Homey displays W/V to one decimal and A to three. Tiny nonzero values
  may round on native numeric cards; technical text keeps scientific notation.
- Add two separate candidate phase sums in W, plus two circuit/sum-status cards.
  A sum requires all three power fields in ONE strictly accepted decoded payload.
  Mixed-sign phases are algebraically netted before any future direction split;
  no positive/negative phase splitting, CT1+CT2 addition or voltage/current sum.
- A reported total disagreement suppresses that packet's sum. A partial power or
  total-only packet invalidates its circuit sum immediately, even when the old
  phase cache could supply missing values. A complete phase-only packet can make
  a sum; it does not certify the unobserved reported total or unit/sign contract.
- Unrelated voltage/current/other-bank traffic cannot renew or invalidate a sum.
  Exact 90-second expiry uses that sum packet's own receipt, never last traffic.
  Same packet does NOT prove simultaneous measurements or measurement freshness.
- Existing raw reported totals remain separate and unscaled; they do not become
  unit-labelled or silently substitute for a missing phase sum. Counters remain
  raw, unmapped and individually aged. No inferred zero for a missing field.
- Optional CT1/CT2 circuit-description settings default to unspecified. Choices:
  grid, hybrid inverter (solar + battery), solar-only inverter, load. Allowlisted
  user descriptions change status text only, not numbers, signs, subscriptions,
  field mappings, counter roles, source ownership or verified registry gates.
  A hybrid circuit is never automatically declared solar-only production.
- Existing devices add new capabilities idempotently before monitoring. Existing
  IDs, account binding and explicit consent survive. Per-instance titles and
  tag/Insights fences are applied on upgrade. Capability-add/option failures or
  teardown during an upgrade cannot start a subscription. Disable/account change/
  uninit clears old AND new readings. Description edits cannot revive a stopped
  preview or renew packet ages.
- EN/DE/NL explain candidate ordering, user descriptions, packet/measurement-time
  distinction, sum suppression and closed automation gates. The preview remains
  class other, no Energy declaration, standard meter/power capability, app Flow,
  tags, Insights, commands, new capture, numeric support export or persistence.

## Counter investigation and next gate

The newly compared UI distinguishes net per-phase grid energy, grid import,
grid export and net import from a separate inverter-circuit energy view. This
strengthens the existing 773 signed-phase/import/export/net hypothesis in
DUAL_CT_COUNTER_AUDIT.md; it does not prove child-field meanings, Wh scaling,
daily/lifetime period or reset origin. No 773-to-CT2 production mapping, 997
numeric decoding or Homey Energy activation is introduced. Next validation uses
owner hardware and existing consented evidence, not another planned tester export.

Homey Energy still needs validated circuit scope/W/sign, source-overlap handling,
freshness/continuity and native physical acceptance. An installation's grid
connection is a candidate authoritative source, not an automatically adopted one.
CT2 hybrid throughput cannot stand in for pure PV production or BYD state/energy.

Native Homey tile layout, installed-device upgrade and physical meter acceptance
remain pending. Synthetic lifecycle/decoder tests and verified CLI validation are
not a claim of hardware or installed-host acceptance. No new Test release or
tester action is required by this local continuation.

## Local verification

895/895 tests pass, including 13 new regressions for native phase projections,
packet-only signed sums, partial/mismatched/malformed packets, independent expiry,
scope/clock/clear handling, role isolation, additive upgrades, option fences,
failed/late upgrades and explicit enable after a failed upgrade. Lint, dependency
audit (0 vulnerabilities), diff checks and Homey CLI 4.5.3 verified validation pass.
The final tests and CLI build run sequentially because both use .homeybuild.
Manifest readback confirms the other nine drivers, all existing custom capability
definitions, permissions, app Flow declarations and version are unchanged.

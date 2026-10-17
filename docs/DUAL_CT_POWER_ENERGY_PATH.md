# Dual CT power-based Energy preparation — 17 October 2026

## Follow-up: source, persistence and adoption plumbing, LOCAL / UNPUBLISHED

The three preparation sprints now provide a strict CT1 packet adapter, serialised
checkpointed accounting and explicit per-grid adoption/authority rules. See
[DUAL_CT_GRID_ENERGY_PREPARATION.md](DUAL_CT_GRID_ENERGY_PREPARATION.md).
They remain uninstantiated by the app/drivers and cannot activate existing
devices. The original strict trial still requires measurement timestamps. The
new session additionally implements an explicitly approximate receipt-timed path
ONLY behind a distinct developer-validated live-freshness contract, not a fallback
or a claim of measurement timestamps. The production contract resolver is empty.
Both trials and the new session retain contributesToEnergy false; the arithmetic
interval helper is shared without changing strict-trial timing behavior.

The new raw preview driver is useful without Energy adoption. It deliberately
has no standard meter capabilities, Energy declaration or controls. The original
meter's accounting remains unchanged. No new testing request to Robert is needed.

`dualCtPowerEnergyTrial.ts` adds a pure, unwired rehearsal alongside the existing
native-counter trial. These are alternatives, never concurrent accounting paths.
The power path does not depend on native counter decoding, counter periods or
reset semantics. Both still return `contributesToEnergy: false` and
`migrationAllowed: false`. Neither is consumed by a driver, app or monitor.

## Power path contract

- Input must eventually come from a developer-verified grid source with confirmed
  watts, direction and measurement freshness, normalized to positive import and
  negative export. Current raw banks, receipt-only candidates and user labels do
  not meet this contract. The verified-contract registry remains empty.
- One explicit source identity must include account/device/channel/session scope.
  A different source is rejected and breaks the integration anchor. Rebinding is
  explicit, preserves local totals and drops the old session baseline.
- Integration uses linear interpolation between successive fresh measurements.
  Direction crossings split at zero into separate import/export triangles, not
  the net area. Results are derived Wh, not vendor lifetime or daily totals, and
  are estimates between observations rather than revenue-grade metering.
- Both measurement and receipt times are required. Duplicate/reordered samples
  cannot add energy. Invalid samples, rollback or gaps >=90 seconds break the
  interval; no assumed zero, held-power fill, extrapolation or downtime estimate.
- Restore preserves supplied totals but discards the baseline. No vendor lifetime
  seeding, native-counter mixing, automatic source replacement, daily reset or
  migration is performed. Stale power becomes null while local totals are retained.

## Activation is separate work

Before any Homey Energy wiring: register an evidence-backed model/firmware/grid
contract, implement explicit authoritative-source adoption and overlap exclusion,
define persistence/migration/rollback and unavailable-reading behavior, then
validate native Homey hosting, reconnect/upgrade and actual meter direction on
the owner's hardware. A power route can be adopted independently of counters
after these gates; counter support can follow later. There is no customer toggle
that bypasses them and no new Energy runtime/store schema in this Test release.

Synthetic regression coverage includes both signs and zero, asymmetric direction
crossings, exact freshness boundaries, duplicate/reordered/cached/future samples,
wrong units/source, reset/restart/rebind, overflow and a 72-hour replay. Tests do
not establish physical scale, direction, bank roles or installation correctness.

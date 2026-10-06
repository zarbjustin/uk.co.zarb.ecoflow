# Sprint 3 — model and capability preparation

**6 October follow-up:** [ES21 core monitoring](STREAM_MODEL_COVERAGE.md) is now
admitted locally as an opt-in beta based on broader public capture/test review.
The historical offline-only model decision below is superseded. The extra
PV/string/socket capability gates and missing Homey hardware acceptance remain.

5 October 2026. Implemented locally on `codex/stream-next-wave-test`, alongside
the unpublished Sprint 1–2 follow-ups. This is the software/research increment,
not completed hardware admission or a store release. Source version stays
1.10.18; the published build 33 does not contain these follow-ups.

## Evidence and its limits

Reviewed the upstream parser and masked captures at
[`8cc4624f10a4fe2f75d5a389937982ca8deb9736`](https://github.com/shuette42/ecoflow-energy-ha/tree/8cc4624f10a4fe2f75d5a389937982ca8deb9736).
These are third-party reverse-engineered observations, not an official EcoFlow
contract or Homey hardware validation. In particular:

- [Parser](https://github.com/shuette42/ecoflow-energy-ha/blob/8cc4624f10a4fe2f75d5a389937982ca8deb9736/custom_components/ecoflow_energy/ecoflow/parsers/stream_ac5000_proto.py):
  serial-keyed direct MPPT fields, per-entry omission rules and a 2.5 W rounding
  tolerance for reported total versus present strings.
- [Both-connections PV capture](https://github.com/shuette42/ecoflow-energy-ha/blob/8cc4624f10a4fe2f75d5a389937982ca8deb9736/tests/fixtures/stream_ac5000/es21_pair_pv_both_connections_masked.json):
  ES21 source/peer records across night/day and a relayed partial record.
- [Socket capture](https://github.com/shuette42/ecoflow-energy-ha/blob/8cc4624f10a4fe2f75d5a389937982ca8deb9736/tests/fixtures/stream_ac5000/es22_socket_458_masked.json):
  AC-socket output remains separate from the direct MPPT total.

The [official API boundary reviewed in Sprint 2](SPRINT_2_TOPOLOGY_STATUS.md)
still does not establish cross-generation membership, expansion capacity or a
gateway identity. This increment does not label the app-auth wire protocol as
an officially supported Developer API.

## Admission matrix

| Candidate | Evidence/units | Local treatment | Remaining gate |
|---|---|---|---|
| ES21 / PV-equipped STREAM 5000 | Public masked captures, shared subset of 254/39 and BMS fields | Dedicated offline research adapter, absent from runtime/model registries | Product identity, charging/discharging/idle, linked-unit and lifecycle hardware validation |
| Direct MPPT total | `f50.1.3`, W, keyed by serial | Parsed as `unit.pv.totalW`; research projection only | Source attribution, stale/delta handling and app comparison on hardware |
| PV strings 1–4 | `f50.1.9`–`.12`, float W | Parsed per unit; never flattened or allocated by position | All channels need local validation; string 1 especially lacks a direct app-time anchor in the reviewed upstream evidence |
| Solar-system node | `f11.9`, W | Kept separate as `solarNodeW`, matching source required | Verify third-party/system scope; do not add it to MPPT by assumption |
| AC socket output | `f11.7`, half-W normalized to W | Local-source candidate; existing grid-to-socket accounting unchanged | Loaded/idle hardware comparison and socket scope |
| Expansion capacity/membership | No complete verified contract | No mapping or new model | Expansion-equipped installation with explicit units and inclusion rules |
| Gateway identity/role | Not verified | No pairing or mapping | Device-list identity, telemetry, functional/Energy role |

`32/50` BMS fields 11/12/13 describe mAh in the reviewed upstream mapping. They
are not system kWh, expansion count or installed usable capacity. They remain
unmapped. Unknown `254/40`/high-numbered fields are not guessed from positions.

## Local implementation

- `streamAc5000Protocol.ts` decodes direct PV under each serial-keyed `f50`
  record. `f54` cannot overwrite its PV fields. Bundled partial records merge
  present keys rather than dropping previously present strings.
- A present entry without PV scalars follows the observed night shape. Missing
  strings in daylight become zero only when a stated total accounts for the
  present strings within 2.5 W. Without that evidence they remain omitted, not
  zero and not an inferred residual. An absent/empty whole group clears nothing.
- Invalid scalar wires/NaN/infinite values do not become a night reset; malformed
  entries are contained independently. Candidate projection rejects negative
  and oversized power. The defensive bound is not a product rating.
- `stream5000Capabilities.ts` projects research readings for the requested serial
  only. PV attribution requires that unit's record; socket/solar-node attribution
  requires a matching source. It does not sum these scopes, publish Homey tiles,
  create Energy counters, or keep an installation online using accessory data.
- `streamPv5000Research.ts` provides an explicit ES21-only offline entry point
  using the corroborated decoder subset and existing conservative SOC/power
  mapping. It is not imported by production adapters or pairing. ES21 remains
  unsupported in the production model allow-list.
- The regression fixture contains selected verbatim `f50` groups from public
  masked captures with provenance. Its synthetic source header is explicitly
  identified as a test wrapper, not additional device evidence. No private
  diagnostics, credentials or full real serials are added.

Driver IDs, pairing data, beta settings, Homey capability manifests, widgets,
installation-only Energy roles and persisted kWh totals are unchanged. No
control command, automatic grouping, capacity-weighted SOC or migration is added.

## Verification and remaining work

The full suite passes **272 tests**, including eleven new research/capability cases:
ES21 admission isolation, foreign source rejection, masked night/day/partial
capture replay, own/peer attribution, rounding boundaries, delta/bundle merging,
malformed values, socket/solar separation and unmapped capacity/gateway data.
Runtime replay confirms PV-only frames cannot refresh availability, add tiles
or advance cumulative Energy totals for an admitted AC 5000.

Build/lint, full dependency audit (zero findings), Homey publish-level validation
and whitespace checks pass. The upstream MIT notice is retained in
`EXPERIMENTAL_STREAM_AC5000.md`.

Hardware admission remains open. Before enabling ES21 or adding tiles, collect
time-aligned EcoFlow per-unit/system screenshots and redacted captures covering
direct PV strings, third-party solar, loaded/idle socket states and reconnect.
Use already-linked systems; do not request linking/unlinking or deletion just for
research. Establish observation age/availability before retaining candidate
readings in a device or widget. There is no new candidate-value cache in this increment.

Expansion/gateway work needs new evidence rather than generic-prefix admission.
Mixed-generation consolidation still needs the Sprint 2 positive/negative matrix.
Sprint 1's Energy discrepancy, production startup and picker reports remain
unresolved. Passing these tests does not close any of those reports.

No commit, push, version bump, store upload, live installation or control write
was performed. A future Test release requires explicit authorization and green CI.

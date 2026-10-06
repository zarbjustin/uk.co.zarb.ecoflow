# STREAM model coverage and admission evidence

**6 October development follow-up:** the unpublished [ecosystem candidate](STREAM_5000_ECOSYSTEM_WAVE.md)
adds observed, serial-attributed physical MPPT/socket tiles for the already admitted
ES21/ES22 adapters, freshness and read-only configuration. The historical offline-PV
wording below records the earlier baseline; it is superseded for this development
candidate, not a claim of hardware acceptance or a new product/model admission.

6 October 2026. Local, unpublished increment on `codex/stream-next-wave-test`.
Source version remains 1.10.18. Published build 33 does not contain ES21 admission
or the local Sprint 1–4 follow-ups. No live installation, control write or Git push.

## Coverage

| Model | Identity / route | Local support | Remaining gate |
|---|---|---|---|
| Original Ultra / Pro / AC Pro / Max / AC / Ultra X | Explicit BK registry; Developer API | Existing monitoring and guarded controls, unchanged | Existing hardware/control matrix |
| STREAM AC 5000 | ES22; app-auth MQTT; `es22` adapter | Existing beta Home Battery and optional unit monitor | Hardware/soak acceptance |
| STREAM 5000 (PV-equipped) | ES21; app-auth MQTT; dedicated `es21` adapter | New opt-in beta core battery monitoring through the same roles | First Homey hardware acceptance, PV/linked-unit/reconnect comparisons |
| STREAM 3000 | No corroborated prefix/telemetry contract found | Not admitted | Identity, captures, units and scope |
| STREAM Expansion Battery 5000 | Product exists; nested versus independent identity unresolved | No separate pairing or automatic capacity mapping | Host-plus-expansion inclusion rules |
| STREAM Expansion Battery 3000 | Official support FAQ identifies AC 5000 stacking compatibility; distinct from the standalone 3000 host | Discovery hint only; no prefix admission or separate Energy battery | Verified pack identity, host inclusion and explicit capacity units |
| STREAM Gateway / Smart Meter Dual CT | Catalogue is not a cloud identity/role contract | No new adapter; existing meter support is not proof of support for a new meter | Exact identity, protocol and Energy role |

ES21 adds system percentage, signed battery power/state, house/grid readings and
local BMS temperature/health when present. Direct MPPT charging enters the
battery flow calculation. MPPT totals/strings remain offline candidates, not
extra Homey solar/energy tiles. Capacity is not inferred from BMS mAh or pack count.

Only the installation Home Battery contributes power and cumulative charged/
discharged kWh to Homey Energy. The optional physical monitor uses a custom
battery-flow capability without Energy meters. Ambiguous linked-unit direction
is cleared, not copied from the installation. Pair one Home Battery per already-
combined installation. Peer observations are not a stable membership/authority
contract: do not auto-merge BK/ES systems or pair an aggregate for every member.

## Sources and confidence

- [Official STREAM API documentation](https://developer-eu.ecoflow.com/us/document/PP3?id=2058828605315256321)
  was read in the browser during this review. It documents BK examples/main-SN
  routing, not an established ES21/ES22 app-protobuf or mixed-generation membership
  contract. Text fetching cannot render this SPA reliably. App-account authentication
  must not be described as official Developer-key support.
- [EcoFlow UK catalogue](https://uk.ecoflow.com/products/stream-series-solar-battery-storage?variant=54491218936147)
  confirms STREAM 5000, AC 5000, expansion and Dual CT products, not protocol mappings.
  No advertised rating becomes a control setpoint.
- [shuette42/ecoflow-energy-ha](https://github.com/shuette42/ecoflow-energy-ha/tree/8cc4624f10a4fe2f75d5a389937982ca8deb9736)
  reviewed at pinned commit `8cc4624f10a4fe2f75d5a389937982ca8deb9736` (current main
  at this check). Its parser, tests and public masked ES21 captures corroborate
  identity/shared core frames. This is reverse-engineered hardware evidence, not
  an EcoFlow guarantee or our Homey hardware pass. Relevant paths:
  `custom_components/ecoflow_energy/ecoflow/parsers/stream_ac5000_proto.py`,
  `tests/test_stream_5000.py`, `tests/fixtures/stream_ac5000/es21_frames_masked.json`
  and `es21_pair_pv_both_connections_masked.json`.
- [MichelFR prefix inventory](https://github.com/MichelFR/ha-ecoflow-iot/blob/main/KNOWN_PREFIXES.md)
  independently identifies ES21/ES22 and Developer API 1006, but supplies no
  3000/expansion/Gateway adapter contract.
- [htims1989/ecoflow-public-api](https://github.com/htims1989/ecoflow-public-api),
  [tolwi STREAM AC Pro work](https://github.com/tolwi/hassio-ecoflow-cloud/pull/793)
  and [ioBroker's inventory](https://github.com/foxthefox/ioBroker.ecoflow-mqtt/blob/main/lib/ecoflow_data.js)
  inform original STREAM boundaries, not a missing new-generation contract.

Upstream ES commands use different containers from BK. Scheduled-power readback
is not proof of physical power response. No control writer is added.

## Durable rules and validation

1. Admit an exact prefix/model and named adapter together. Never admit a marketing
   name, generic ES prefix or resemblance to a BK quota.
2. Share only corroborated fields. Retain each model's adapter/diagnostic label and
   pairing metadata. Legacy `stream_ac5000` stays ES22-only; immutable IDs do not change.
3. Preserve serial attribution, system/unit SOC history, absent-group deltas and
   malformed/unknown handling. ES21 reports use `es21_peer_records`, without serials.
4. Keep pairing default-off, monitoring-only and provisional. Disabling beta access
   does not stop existing devices. Retain attribution/licensing for public fixtures.

Tests cover admission/discovery, beta denial, duplicates, legacy isolation,
Developer API quarantine, raw core/PV-charge replay, own/peer SOC, persistent
aggregate-only energy and anonymous topology. Synthetic source wrappers are
labelled; they are not extra hardware evidence. Existing ES22/BK tests remain required.

Before Test release: green tests/lint/audit/Homey validation and explicit release
authorization. Then real ES21 charge/discharge/idle/PV, linked/independent setups,
silence/reconnect and 24–48-hour soak checks. Use already-linked installations;
do not request deletion/linking/unlinking simply for research. See
[tester validation](TESTER_VALIDATION.md).

Next: direct-PV/string and socket comparisons; expansion/Gateway/Dual CT identity;
authoritative mixed-generation membership/energy scope; model-specific controls.
The [Sprint 5 discovery candidate](SPRINT_5_EXPANSION_DISCOVERY.md) adds schema 3
anonymous account-prefix inventory and historical peer-field visibility. These
are research hints, not model admission or evidence that every pack is visible.
Existing Energy/picker/startup reports remain open. Also reconcile BK reserve/
charge helpers with the official recommended 3–95% reserve and 95% charge ceiling
before a control release: legacy helpers still permit 100% and were not changed here.

Local verification: **304 tests pass**, TypeScript/lint pass, full npm audit finds
zero vulnerabilities, Homey publish-level validation and whitespace checks pass.
No CI, Test-channel deployment or physical acceptance is implied.

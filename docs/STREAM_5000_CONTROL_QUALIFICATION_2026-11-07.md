# STREAM 5000 control qualification - 7 November 2026

This source-only follow-on addresses the core THEN contract, not installation
or battery-control approval. Diagnostic HEAD and version remain
`1a85e2fec91eab1a88c41bfac842be308ffe0a7a` / 1.11.24 with prior dirty work
preserved. The local packet is
`../work/output/control-qualification-20261107T221624Z-9da5154f`;
its final receipt is authoritative for integrated source/review/checks.

## Community scenarios and actual capability

EdNL's posts [95](https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/95)
and [96](https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/96)
ask for AC5000 IF/THEN control. EdNL is not Ed_van_der_Stelt, Robert, Stefan
or Patrick. No contact or posting occurred.

| Goal | Source-candidate IF / notification support | Battery THEN status |
|---|---|---|
| Backup SOC floor | Current unit SOC/state/power guards; reported reserve configuration | Only disabled pure reserve-setting groundwork; physical protection/charging effect unqualified |
| Cheap-period charging | Owner-authored time/tariff conditions and current battery-state monitoring | No qualified charge-at-watts/task action; raising reserve is not charge-now |
| Solar-surplus use | Qualified directional grid export; separately qualified PV evidence would be required | Export alone does not prove solar surplus or authorize battery dispatch |
| Expensive/high-import reduction | Qualified import AND and sustained CT1 WHEN -> ordinary notification THEN | No qualified discharge-at-watts/demand-reduction writer; feed flag is not requested power |
| Normal pause / native return | Stop local intent planning; observe fresh reported configuration | No qualified ordinary pause or ownership handover; emergency/socket-off/mode ACK are not substitutes |

The manifest exposes **no AC5000/5000 battery THEN cards**. Existing ten battery
action cards remain filtered to original `driver_id=stream`; they are not
automatically compatible with STREAM 5000. No new live control adapter is bound.
There is a separate pre-existing explicitly gated ES21 house-reserve bridge in
the repository; it was not enabled, queried or reused here and is not evidence
of AC5000 action support. Do not say there is no writer code anywhere.

## Official contract, not physical qualification

The [official STREAM 5000 page](https://developer-eu.ecoflow.com/us/document/PP3?id=2115695633708867585)
was freshly retrieved anonymously through its public documentation API and CDN.
The full 191-line markdown was read on 7 November; publication/update metadata
is 29 October. Local public provenance and digest are in
`OFFICIAL_CONTRACT_REVALIDATION.md`; no signed device endpoint was called.

Reserve percentage is `bpBackupConfig.backupSoc`, integer 0-100, with the switch
already on or explicitly enabled. The initial proposed operation never enables
or disables it; off has a documented zero-percentage side effect. The set
envelope is 38/254, directions 1/1, destination 2, boolean `needAck:true`.
Selective readback uses flattened hyphenated names.

For multiple devices, official instructions require main-device lookup before
querying/setting system-level values. Socket commands target the socket owner.
Actual main routing and which reserve values are unit versus system scope still
need native qualification; a unit-scoped synthetic fixture is not that proof.

Five official modes are distinct from the captured-app parser's three labels.
`TIMER_TASK` is not a task CRUD schema; `EMERGENCY_STOP` is not ordinary pause;
`AI_MODE` ACK/readback is not native-ownership handover. The feed-limit boolean's
polarity/effect is not a qualified export permission or watt target.

HTTP string `"0"` / correlated MQTT boolean `cmdOk` means acknowledgement.
Independent current configuration and action-specific physical outcome are
separate. A post-ACK same-value observation does not prove command causality
without native revision/correlation and authority evidence.

## Source repairs and disabled implementation boundary

Independent first passes reproduced pending forward/restoration progress
reversal, duplicate known singular configuration fields, and bounded reference
input faults. The configuration decoder now rejects ambiguous known singular
fields/groups rather than choosing the first value; valid repeated task rows
and bundle siblings remain supported, and rejected headers do not renew ages.

The reserve pilot and new control-contract core remain pure, default disabled
and unwired. Installation ownership is a new bounded architecture requirement,
not an exposed live-control regression. It must not be mistaken for exclusion
of native AI or external writers. Consult the implementation/reconciliation
and final review for exact completed APIs and remaining limitations.

## Practical notification Flows after approved deployment

These are candidate-source recipes, **not a statement that the old installed
1.11.24 exposes the new cards**, and no Flow was created/executed here.

| Recipe | WHEN / AND | Ordinary THEN |
|---|---|---|
| Sustained import warning | Dual CT Energy `smartmeter_grid_power_sustained`: import, 1000 W, 120 seconds, 100 W hysteresis, 3600 seconds cooldown | Send a Homey notification |
| Sustained export awareness | Same qualified CT1 WHEN: export, 500 W, 120 seconds, 100 W hysteresis, 3600 seconds cooldown | Notify "sustained grid export", not "solar surplus" or "charge now" |
| Fresh low-SOC awareness | Standard battery-level change; `stream_5000_reading_current` field `soc`, role `unit`; standard battery-level condition | Send a notification; this is current-state monitoring, not an invented crossing through unknown time |
| Fresh battery-state/power awareness | A standard relevant capability change or owner timer; current-reading guard field `state` or `power`, exact unit/system role; compare the corresponding current token | Send a notification, never infer battery state/SOC from grid watts |
| Conditional import/export | Owner's existing WHEN plus `smartmeter_grid_power_above` for original meter or qualified Dual CT Energy CT1, chosen direction/threshold | Owner's ordinary notification/device action, not an unqualified AC5000 battery action |

The sustained WHEN is filtered only to `smartmeter_dual_ct_energy`; the power
AND accepts original smart meter plus that driver. Preview and CT2 do not become
property grid accounting/notification sources. Equality is not above the
threshold; missing/stale inputs cannot become true via condition inversion.
Unknown ends dwell; recovery does not backdate it; duplicate receipts do not
advance it. No new reader or household runner was activated.

## Native evidence, approval and stop line

A bounded local read at 22:23 UTC observed two available 5000-unit records and
one available aggregate with ES21 hints/configuration tiles. SDK presentation
does not establish native model/firmware, own-field receipt, main routing,
command correlation, AI-compatible authority or physical effect. Real
qualification records remain empty.

The exact next proposal is in `PILOT_APPROVAL_PACKET.md`: authoritative signed
reads under separate approval, then one already-enabled native 50 -> 51 setting
experiment on a qualified selected scope, with separately approved conditional
51 -> 50. Different baseline, drift, uncertainty or missing authority aborts;
no retry, automatic compensation, inferred effect or AI takeover.

Installation/transport binding and battery THEN exposure remain separately
approved stages. Native/model/scope, three-phase, accuracy, daylight sparse
microinverter and exact-runtime 48-hour gates stay open. No commit/push,
staging, install/restart, battery/settings/Energy mutation, Flow execution,
publication or community contact; EcoFlow AI ownership is unchanged.

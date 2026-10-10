# Smart Meter Dual CT — asset and integration assessment

Reviewed 10 October 2026. No new driver, pairing admission, control, capability
or Energy source is enabled. Test publication remains on hold.

## Next-wave implementation status — original meter and Dual CT

The statement above concerns Dual CT. The original meter now has a local,
unpublished implementation based on a fresh read-only authenticated audit:

- Account inventory contained an original BK21 meter, no Dual CT meter. Direct
  meter REST quota/all and targeted phase/counter reads were empty; host REST
  exposed aggregate grid and home load, not the meter's phase details.
- Two bounded Developer MQTT observations subscribed only to the authorised
  meter/host quota topics. The meter supplied phase power/voltage/current,
  phase flags, grid state and a nested energy record. This contradicts a universal
  claim that BK21 readings require app-login authentication: the upstream account
  requirements do not describe every installation/transport.
- Observed records satisfied `todayActive - totalReactiveEnergy =
  totalActiveEnergy`, consistent with the upstream import/export/net hypothesis.
  No export or midnight experiment was performed; no raw captures, credentials,
  serials or absolute account counter values are stored here.
- The current public EU document catalogue searches for meter, Dual and 5000
  yielded no dedicated contract. The STREAM document metadata still points to
  its May 2026 content. Upstream shuette42 revision
  `3831d7741d718f28556d55a68aff47a9da37585b` supplies an original BK21 parser;
  MichelFR revision `45d9bb2952904cffa590cb811da0c316c66dd589` exposes original
  meter JSON fields. Neither reviewed tree established a Dual CT adapter.

| Sprint | Local implementation / remaining acceptance |
| --- | --- |
| 1: Original telemetry | Direct meter Developer MQTT; linked-host REST fallback; source arbitration; per-field receipt ages; stale phase/grid values cleared; serialised expiry and lifecycle teardown. Physical screenshot comparison/reconnect acceptance still needed. |
| 2: Native energy | Allowlisted raw counter candidates in diagnostics only. Existing integrated totals remain authoritative, with duplicate-source suppression and gap/source-change anchoring. Native migration is disabled pending direction/midnight/restart evidence and baseline continuity design. |
| 3: Meter UX | Native power always grid, optional separate home-load capability; existing setting ID retained with clearer labels; fresh signed import/export threshold condition. No meter writes or protective automation. |
| 4: Dual CT discovery | Separate staged artwork and explicit metadata quarantine already present. Identity, channel role and direct-versus-host capture require an authorised installation. No guessed prefix or channel admission. |
| 5: Dual CT adapter | Not implemented without the sprint 4 contract; second-channel PV/load must remain distinct from grid and independently configured. |
| 6: Acceptance/release | Regression coverage implemented locally; deployment/installed-state and hardware validation remain separate gates. No publication or certification action authorised by this work. |

Original-meter subscription identity changes without changing paired IDs or
saved host addresses. Re-pairing is not required by this source implementation.
The phase flags/grid state currently appear in the support report, not new
unverified enum capabilities. Counter candidates are not labelled as daily,
reactive or authoritative lifetime energy based merely on their API names.

The regression suite covers direct/host arbitration, stale/future/out-of-order
receipts, explicit zeros, partial-frame ages, unknown power factor, expiry,
teardown, optional home load, fresh Flow conditions, privacy projection and
non-migration of existing counters. The new original-meter code has no device
write path. Existing battery energy accounting and topology repair are unchanged.

For Dual CT capture, record (privately) discovery product identifiers, CT role
configuration and simultaneous EcoFlow screenshots; subscribe only to that
owner's devices. Collect unused/zero/disconnected channels, direction changes,
partial/full frames and reconnects. Redact identifiers before any repo fixtures.
Do not trigger calibration, reset, safety-limit changes or electrical load tests
without a separately agreed hardware procedure.

## Confirmed product information versus integration evidence

- [UK product](https://uk.ecoflow.com/products/ecoflow-smart-meter-dual-ct?variant=54905815269715)
  confirms the catalogue product but provides little technical detail.
- [EcoFlow ES technical description](https://es.ecoflow.com/collections/all-products/products/smart-meter-dual-ct)
  describes two three-phase channels (six CTs), grid plus third-party PV or load
  monitoring, Bluetooth/Wi-Fi/RS485 and STREAM 5000/AC 5000 compatibility. These
  are hardware features, not proof of accessible API fields or local controls.
- [Upstream meter documentation](https://github.com/shuette42/ecoflow-energy-ha/blob/main/documentation/entities/smart-meter.md)
  and [parser](https://github.com/shuette42/ecoflow-energy-ha/blob/main/custom_components/ecoflow_energy/ecoflow/parsers/smart_meter_proto.py)
  explicitly describe the older BK21 EF-EM-P3-120 meter. Its app-auth measurements
  and native import/export counters are useful research for the original meter,
  but cannot be reused as a Dual CT contract without captures.

No verified Dual CT identity, channel mapping or API contract was established by
this review. No authenticated live Dual CT probe was performed; hardware is not
present in the owner's installation yet. Do not mistake absence of a verified
contract here for proof that the product cannot expose data.

## Assets

See [asset provenance](assets/smart-meter-dual-ct/README.md). A transparent
monochrome wireframe/SVG is prepared for a future Homey driver; white-backed
original product imagery is prepared for a future store listing. Neither is
bound to an active driver: changing the old meter's icon globally would mislabel
existing devices. The antenna is an accessory, not a second Homey device.

## Discovery hardening

Previously the broad Smart Meter name fallback could admit this unverified model
to the legacy smartmeter driver. Explicit Dual CT product metadata now stays in
the unsupported/research path, even if EcoFlow reuses an old prefix. A custom
name on an existing, identified old meter does not change its model. Unknown
Dual CT device names also cannot activate the legacy fallback. Cached inventory
continues to expose only anonymous product hints and no supported-model claim.
Existing paired meters and their artwork/accounting are not migrated.

## Proposed implementation once evidence is available

1. Identify product model/type and masked serial prefix from account discovery;
   establish whether telemetry is directly addressed to the meter or embedded
   in its STREAM host. Capture read-only full/delta frames with matching EcoFlow
   screenshots and timestamps. Test disconnected/unused CTs and partial frames.
2. Verify CT1/CT2 channel assignment, sign, units, phase ordering, configured role,
   receipt cadence and native counters. Do not assume CT2 is solar; it may be a
   monitored load. Do not sum CT1 and CT2 into grid demand. Do not manufacture
   voltage/current/energy when the API omits those readings.
3. Add a distinct selectable Smart Meter Dual CT model/entry using its own
   verified adapter and artwork, sharing common meter lifecycle where safe.
   Grid import/export is the Homey Energy grid role, not home storage. One
   authoritative grid meter per installation: avoid duplicate reporting through
   both this meter and another Homey grid meter or derived STREAM grid device.
4. Offer the secondary circuit as explicitly configured PV or load monitoring,
   initially non-Energy until role and accounting are confirmed. Avoid counting
   CT2 PV again when the same inverter already contributes through another app.
5. Candidate readings: per-channel signed power, per-phase voltage/current/power,
   import/export energy if exposed, availability and field freshness. Candidate
   IF/AND cards: grid direction, surplus threshold and secondary-circuit power.
   Native protective status may be informational if exposed; Homey must never
   be presented as a substitute for the device's electrical safety protection.
6. Replay regression fixtures, verify direction/zero/missing/stale behaviour,
   restart/counter continuity and Energy roles; then hardware acceptance before
   Test/store support claims. No reset, calibration, protection-limit or RS485
   command path is inferred from the product's communication methods.

Keep this separate from the original-series mixed-generation reporter repair.
The same privacy, freshness and one-authoritative-source principles apply.

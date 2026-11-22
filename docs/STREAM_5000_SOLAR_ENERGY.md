# STREAM 5000 Solar review candidate

Development candidate 1.11.29 is scoped to the ES21 solar changes on the diagnostic branch. Its runtime-source fingerprint is `6f9810d575b3644cb9325aed7ddc863663d06d9af720ebbd912063df11b66cb4`. The separate ES22 task-comparison changes in the shared checkout are outside this candidate. Installation, pairing and daylight measurements require a separate session.

## Sprint 1 member-only solar correction, 22 November

The working-tree correction lets a Solar tile receive its own ES21’s direct PV through a linked ES21 reporter without pairing a second Homey device. The packaged 1.11.29 archive above predates this correction.

The tile keeps its own topic open. Once per minute it checks the bound EcoFlow account’s inventory. With saved Developer API keys it resolves the unit’s current main and subscribes to that reporter only if it is another owned ES21. With only app sign-in and exactly one other owned ES21, it listens for a live record explicitly labelled with the paired unit’s serial. Inventory proximity alone never supplies watts or establishes a main-unit role. With multiple possible peers, app sign-in alone cannot select a relay. Direct reporting still works.

The shared broker keeps one subscription per serial across consumers. The Solar tile releases only its own interest on relink or teardown. A failed or ambiguous lookup retires the relay. A pending lookup cannot retain it past two minutes from its last successful check. A new relay or MQTT connection starts a fresh integration interval. No unobserved interval is added to the saved counter.

Offline tests exercise the driver and the MQTT router with one Solar tile, including delayed duplicate reports, reconnect, relinking to a third ES21, lookup failure, account change and shared-topic cleanup. The daylight hardware gates below remain open.

## What the owner sees

Add **STREAM 5000 Solar** once for each owned ES21 with panels wired to its PV inputs. If only one unit has panels, choose that one. Two panel-equipped ES21s can contribute separately to Homey Energy. Keep the existing STREAM Home Battery for charging and discharging. Original STREAM Solar and the microinverter remain separate sources. Check that another integration is not already counting the same panels.

The tile reports live W and estimated generated kWh accumulated since pairing. A fresh explicit zero shows 0 W. A missing measurement or expired signal leaves W unavailable and preserves the kWh counter. Time without valid readings can cause the estimate to understate total generation. The driver follows Homey's solar panel class and positive generation convention. [Homey Energy documentation](https://apps.developer.homey.app/the-basics/devices/energy#solar-panels)

## Counter and telemetry ownership

- Each tile binds its EcoFlow account and physical ES21 identity at pairing. Each unit has one accounting owner. The source field is the serial-labelled direct PV total in a live 254/39 property message, field 50, entry 1, value 3.
- A linked ES21 can report its peer. The driver routes each record by the unit that produced the power and uses one reporting topic while fresh. The four PV string readings, system solar node, battery discharge and grid export cannot create a second contribution.
- In the original 1.11.29 archive, a member-only reading on the main unit’s topic requires another paired device to keep that topic open. The Sprint 1 correction above removes this dependency for a resolved reporter. Validate the member-only panel arrangement independently.
- Receipt time bounds the estimate. Two continuous samples on the same reporter and connection epoch contribute the mean of their powers multiplied by elapsed monotonic time. A restart, change of source, stale interval of three minutes or longer, or an invalid attributed total breaks continuity. A fresh sample starts the next interval. Retained and broker-marked duplicate deliveries and snapshot replies cannot accrue energy.
- Counters are stored in Wh per physical unit, flushed using the existing checkpoint helper and restored against the surviving kWh capability. Removing a Solar device and pairing afresh is not a history-preservation procedure.

## Local evidence

The linked-pair fixture reports approximately 216 W and 201.97 W. Replaying both unit records on both reporting topics for one minute yields 6.966 Wh across the pair. The suite covers duplicate and retained frames, sparse and malformed readings, source failover, connection expiry, pairing ownership, SDK projection and restart continuity. The regression suite also verifies that a pairing selection cannot seed a generated-energy counter.

## Full-release hardware requirements

All six entries in [the solar acceptance ledger](STREAM_5000_SOLAR_ACCEPTANCE.json) must pass on the candidate fingerprint. Record sanitised comparison results and retain any detailed evidence privately. The following is a proposed validation sequence for separately approved installation and pairing.

| Gate | Evidence required |
| --- | --- |
| Linked source identity | Record which physical units have direct panels, their linked roles and which one reports each record. Match both tiles independently during unequal generation. Check that a peer-only relay or a unit without generating panels cannot create a second copy. |
| Native watts and zero | Compare time-aligned EcoFlow unit PV watts with each Homey tile during daylight. Observe explicit zero and missing/stale behaviour separately. Record sampling offsets and display precision. |
| Generated kWh interval | Compare the two Homey counter deltas and their sum against an independent direct-PV generation reference over the same interval. Use a long enough interval to exceed the reference's display resolution. Record gaps, timing and measurement tolerance before judging the result. A grid meter or a battery charge counter cannot establish PV yield. |
| Restart and gap recovery | Capture protected counters before and after an approved restart or observed interruption. Verify no regression, no downtime fill and normal accumulation from the next continuous pair. |
| Homey Energy projection | Verify that Solar Panels shows the two devices' combined contribution once. Account separately for any original STREAM or microinverter PV. Check that existing battery, grid and device identities and histories are preserved. |
| 48-hour normal use | Record start and end in UTC, on the same runtime, across daylight and darkness. Check signal gaps, availability, monotonic counters and aggregation. Investigate material divergence before passing. |

The linked replay exercises the software logic. It cannot establish the accuracy or coverage of live EcoFlow telemetry on this installation.

## First daylight observation on the linked ES21s

1. Before any installation on Justin’s Homey Pro, verify the candidate archive checksum and identify the exact compatible recovery archive. Capture a fresh private preservation baseline for app version, coordinator state, device identities, settings, Energy roles, cumulative counters, Insights and Flows. Obtain approval for the non-clean update and for each new Solar Energy contributor. An app update briefly interrupts readings across the household integration.
2. Confirm the current panel wiring for each unit and whether EcoFlow offers per-unit PV watts and an independent PV yield reading. Use anonymous labels A and B in shared notes. Pair only units with direct panels after approval. If neither unit has panels, defer the daylight run. If only one has panels, verify its contribution and keep simultaneous two-source generation open.
3. Start when EcoFlow shows sustained positive generation. Record UTC and the display resolution of each reference. Capture per-unit EcoFlow PV watts, each Homey Solar tile, other solar contributors and Homey Energy’s combined Solar Panels value at the start, middle and end. Near-simultaneous samples under steady sunlight make it easier to distinguish update delays from a duplicate source. Record the time offset for each comparison.
4. Take opening and closing kWh readings over the same interval on Homey and the independent direct-PV reference. Allow at least 30 minutes and extend until the change is several display increments. Before scoring, record a tolerance based on display resolution, reference accuracy and timing offset. Sum the two tile deltas and compare with the independently measured generation. Leave the accuracy gate open if there is no independent reference or measurement gaps prevent a meaningful comparison.
5. Stop scoring and retain the evidence if the source cannot be identified, a tile stays stale during confirmed generation, the sum includes a duplicate, a counter falls or a preserved device changes unexpectedly. Record an actual zero at dusk separately from a missing reading. Recovery and the 48-hour soak are subsequent checks.

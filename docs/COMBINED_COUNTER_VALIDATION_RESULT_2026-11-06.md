# Combined counter candidate — owner Development delivery, 6 November 2026

## Outcome

Owner approved installing the exact reviewed combined candidate non-clean on the
existing household Homey. Fresh preflight passed with Homey reserve execution
already disabled and native EcoFlow AI retained. Exactly one Development install
was acknowledged **14:31:51.841 UTC**. App readbacks report running **1.11.20**,
origin `devkit_install`.

No cumulative decrease was observed in the 100-sample startup window or either
full preservation readback. The older runtime's 4 Wh solar decrease remains a
historical failed observation; this result does not retroactively change it.
The owner separately confirms phone icons and the 5000 battery indicator look
correct. This is a bounded update/preservation result, not full hardware/release
acceptance or a completed soak.

## Exact runtime and operation

- Reviewed production commit: `003f2c4aee9c58aeeda7ad907b4c06f1dc8c832d`.
- Source/handover HEAD before delivery: `211e022d1b49dd1fd476b4df61f74d140cd2ce67`;
  clean/fetched local/remote 0/0.
- Archive SHA256: `5a8daa62475500e210991ea6428024b703a72b8f7529aa5ce8eca61da30955ff`.
- Runtime source fingerprint: `89ad4da2352e91baade7a0f5150688fe2d120faf832901abf62b6875c6e3f1af`.
- `clean=false`, `debug=false`; one devkit delivery, no additional restart.

Archive/recovery hashes and exact source CI were checked before execution.
This is exact archive delivery provenance with running/new-session readback,
not an independent installed-filesystem rehash. No rebuild, version bump, store
publication or source change was substituted under the installation approval.

Preflight at **14:30:39 UTC** captured complete identities/definitions/settings,
capabilities/custom metadata, standard/advanced Flows, Insights identities,
whole-Homey Energy definitions and global app-setting equality hashes without
emitting credential values. The immediately pre-install inventory refreshed the
numeric counter baseline. Private-store and whole-backup coverage are not
independently established by these read-only APIs.

Both dedicated execution switches were off; no pending intent, active run lock
or stopping state, and a completed fault-free native lease. The current resident
runner matched its reviewed hash and six legacy reserve cards remained exact
unconditional no-op delegates. The acknowledged historical ownership fault/state,
configuration, lease and app gate were retained. No Flow/config/state/fault or
native battery setting/reserve/task/mode write was issued. Native AI may change
its own reserves naturally; the old Homey reserve expectation was not restored.

## Startup counter observation

One cached manager inventory read per second at most, for a bounded two-minute
window: **14:31:42.140–14:33:42.504 UTC**, 100 completed samples. It began before
delivery to cover startup; no support exports ran concurrently. Ten cumulative
meters were numeric at baseline. Six samples contained transient unknown meters;
unknown was never converted to zero. All ten were observed numeric after the
delivery acknowledgement by **14:31:54.461 UTC**.

The online comparison found zero decreases and zero read errors/throttling.
An independent deterministic offline projection retained each last numeric value
across unknown samples and likewise found zero decreases. Every counter's first
observed numeric value after acknowledgement was at/above its baseline. No
counter rewrite, forced silence, load change, extra MQTT observer, artificial
PV interruption or battery operation was used to obtain that result.

These are sampled capability observations. Generation can mask a short dip, and
the cadence cannot exclude every shorter unseen event or prove absolute interval
energy accuracy. They do not independently read precise private checkpoint Wh,
certify physical raw-counter consistency or exercise failed-store/rollback cases.

## Full preservation readbacks

At **14:34:30 UTC** and **14:36:33 UTC**, comparing with the actual immediate
pre-install baseline:

- All 15 EcoFlow software-device identities and all household device IDs retained.
- Names/zones/notes, settings, capability identities and fixed metadata retained,
  except refreshed icon resource URLs; no other fixed-definition differences.
- All 101 complete standard/advanced Flow definitions retained; no newly broken
  Flow. All 1,217 Insights log identities retained.
- Whole-Homey Energy definitions and global app-setting equality hashes match.
- All ten projected cumulative meters finite/nondecreasing; no formerly numeric
  meter remains unknown in either full readback.
- Execution Flow/config remain disabled. All other execution config fields,
  original execution state/fault/history, native lease and app gate match baseline.

Icon comparison found 182 changed URL fields across 14 devices, with zero changes
to the other exposed icon metadata. All 94 app/driver asset files are byte-equal
between the reviewed old/new archives. The owner then confirmed phone icons and
the 5000 battery indicator look correct, with no settings change. Archive asset
comparison and owner visual confirmation are distinct from a live filesystem
checksum or independently measured SOC accuracy.

## Native/telemetry observations and remaining gates

Fresh subscription configuration in both readbacks still reports
`intelligent_plus` for the two physical 5000 records and aggregate; task-list
reports are known/fresh. No native setting/task/reserve/control command or native
UI navigation was performed. Owner phone confirmation covers presentation only;
independent native unit/system SOC/power/state comparison is still open.

Final cached support projection reports fresh exported fields for original
STREAM aggregate/units and the 5000 aggregate. One physical 5000 unit is live;
the other still has **scope-unverified** power/state (two unknown/stale exported
fields). Do not fill these with aggregate power, zero or a guessed idle state.
There are no reported field-write failures or checkpoint failures in the exported
records; missing checkpoint records for physical monitors are not a persistence
pass. Model/accessory/unit scope still needs its own native evidence.

Read-only store listing at **14:32:51 UTC** confirms **Test 1.11.20/build 87**
and **Live 1.10.3/build 18**. They are unchanged; the new counter fixes are on
Development, not silently promoted to the same-numbered Store Test package.
No Mainline/source push or public tester message occurred in this operation.

No 48-hour soak, automation, deliberate restart/reconnect/silence, Repair/pairing,
Energy activation/source change, native battery command, counter correction or
rollback was started. The startup observer ended normally; no background reader
was left running. Both execution switches must stay off while native AI owns
reserves. All acceptance JSONs remain unchanged: this bounded observed pass does
not close all native-upgrade, model/role, ES22, three-phase, accuracy or soak gates.

## Evidence and continuation

Evidence directory, outside public Git:
`../work/output/combined-counter-installation-2026-11-06/`.
Use `delivered-manifest.json`, preflight/install receipts, startup observer and
continuity projections, both full readback projections, asset/icon proofs,
`owner-ui-confirmation.json`, final health projection and `FINAL_RECEIPT.md`.
Raw inventories, selected state, Flow/Insights definitions and startup samples
remain restricted under `private/`; never upload, index or load them into hosted
model context. The hosted OpenAI coordinator received only public source and
deterministic allowlisted outcomes. Historical receipts were not overwritten.

Local helper syntax checks and documentation whitespace checks passed. No new
full software test run is claimed for this hardware operation; exact source CI
and the 1,471-test validation remain separate evidence. Production source,
package/lockfile and acceptance ledgers are unchanged. Canonical handover/status
are updated locally; no new commit/push is part of this operation. External final
receipt records the shared knowledge refresh and editing-lease release.

Next: review this initial result and resolve the remaining unit-scope/native
comparison questions, then agree a bounded exact-runtime normal-use soak. Do not
claim a full release, automatically resume Homey controls or schedule extra
hardware operations from this checkpoint.

# Dual CT CT1 property Energy release candidate

Release work targets a new, explicitly adopted CT1 property-grid Energy device.
The existing preview stays read-only and is not converted or replaced. CT2 is
excluded from accounting, including when an unused channel reports zero.
The initial hardware scope is single phase, product type 421, with firmware and
timing still unqualified. No three-phase or native-counter production claim.

## Current engineering status

The existing strict wire adapter, persistent power session and single-process
authority are implemented. A Homey write adapter is prepared with a production
default-off boundary. It is not imported by app/driver runtime; no new Energy
device is registered. Code-owned synthetic dependency injection is for testing,
never a customer override. Failed unavailable/power clears remain pending for later local expiry ticks,
without restarting accounting or resetting saved totals.
A qualified firmware/sign/timing contract, reviewed
adoption UI, owned subscription lifecycle and native acceptance remain required.

`npm run release:dual-ct` must fail until each gate passes on the exact candidate.
`npm run release:check` validates the ledger without pretending hardware is ready.
Ledger changes do not activate code. No private source identities, screenshots,
household readings or support correspondence belong in the public ledger.

## identity-firmware

Read the physical model, firmware and owned account binding. Confirm the exact
installed package fingerprint separately from displayed version. No firmware update.

## ct1-property-scope

Establish that CT1 measures the property incomer and includes nested office/shed
circuits; record CT2's disconnected status privately. EcoFlow space membership is
separate from electrical wiring. Check original batteries and the separate
microinverter space independently; never automatically merge their cloud groups.

## phase-units-direction

Compare signed CT1 watts with native EcoFlow and an independent property reading
near in time. Verify phase position and W/scaling in import/export/true zero.
Three explicitly reported phase fields may include unused zero positions; never
fill absent phases with zero or treat unused-phase voltage as connected wiring.

## measurement-freshness

Observe accepted-frame cadence, sparse/partial/unrelated messages, expiry and
natural recovery. Distinguish frame receipt from accepted power and device time.
A receipt estimate requires its own buffered/replayed-channel qualification;
arrival alone cannot certify physical measurement time. No forced silence.

## physical-import-export-zero

Observe natural import, export and idle against the corresponding physical grid
boundary. If a state cannot occur naturally, propose an attended bounded test
with a stop/restoration route for fresh approval. Do not operate household loads,
battery tasks or controls under this document's authority.

## energy-intervals

Compare matched time-window import/export kWh with an independent meter. The new
totals integrate observed CT1 power; they are not native lifetime energy. Check
zero crossing, sample gaps and no downtime fill. Native counter units/period
remain separate research and are not required for this power-based route.

## source-overlap

Review actual Homey Energy inclusion of all property meters and nested submeters.
Require one authoritative property source; excluding an office meter must not
silently leave an unintended replacement. Preserve paired device IDs, counters,+Insights and saved Flows. Exclusions and adoption need scoped owner approval;
no automatic edits to other meters. Review solar/battery duplication separately.

## native-storage-restart

Validate persist-before-project writes on Homey, failure/recovery, restart with
retained totals and a fresh interval anchor, and no integration of unseen gaps.
Restart requires a separately approved window; synthetic tests are insufficient.

## upgrade-rollback-backup

Capture a private preservation baseline. Test non-clean upgrade, restore and
rollback with approved bounds, preserving all existing devices/Flows/settings/
capability identities and counters. A Git revert does not restore Homey stores.
Restoring an old whole-app backup can roll back a checkpoint; define/review the
platform recovery policy before release rather than claiming impossible detection.

## normal-use-48h

Observe at least 48 hours on the exact final runtime after adoption. Check
independent freshness, subscription health, failures, cumulative continuity and
legacy devices across available natural states. No synthetic soak substitution.

## native-desktop-mobile

Verify new-device selection/consent, blocked prerequisites, approximate-power
disclosure where applicable, native Energy rendering, unavailable readings and
recovery on desktop/mobile. Preview readings must not acquire Energy or controls.

## Release sequence

Complete engineering and synthetic checks, then review the exact candidate and
hardware evidence. Any installation/adoption/controlled hardware action requires
its own approval and readback. Exact source CI, Test delivery, installed candidate,
hardware acceptance and Mainline/Live publication are separate checkpoints.
Do not publish or change channels as a side effect of running readiness checks.

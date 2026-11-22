# Dual CT three-phase community Test trial — 1.11.6

Active on store Test as build 73, verified 30 October 2026.
[Install Test](https://homey.app/en-gb/app/uk.co.zarb.ecoflow/EcoFlow-STREAM-Series/test/).
Live and the owner's installed Development app were preserved.

The owner authorised an opt-in Test implementation so community installations can
provide the missing field evidence. This is experimental admission, not completed
three-phase hardware acceptance. Live/Mainline and the owner's installed
Development app are outside this release operation.

## What participants can try

In Add Device → EcoFlow → Smart Meter Dual CT — property Energy, sign in and find
an owned meter. Installation defaults to Single phase. For a true three-phase
incomer, select **Three phase — community trial** and read/accept its additional
acknowledgement. CT1 must cover all three property incomer phases. The trial uses
signed phase sum, then separates net import/export; CT2 is excluded, including
hybrid-inverter/battery output. Do not change any wiring to take part.

Only model 421 with actual current firmware **1.0.0.41** is admitted. The app reads
owned identity and current-package firmware; a participant cannot supply a
firmware or verification flag. An unknown firmware remains unsupported until
separately reviewed. Do not assume a prospective update version is installed.

The existing source-overlap review still applies. The app never excludes another
meter automatically. Review any existing property contributor before adoption;
retain downstream monitors as appropriate. Never add three property sources for
three phases. Participants with an existing functioning Energy device should
leave it in place. This is a new-device trial, not an automatic conversion or a
request to delete/re-pair devices; an earlier failed Energy pairing needs separate
review rather than counter migration.

A trial device is named **Dual CT three-phase trial**. Its totals are estimated
from accepted live power intervals, not billing/vendor cumulative registers.
Missing phases/totals, incompatible frames, stale data and gaps do not get filled
from caches or CT2. Rejected gaps are not scaled back into totals. Native counters
retain precise internal Wh and use Homey's rounded kWh projection.

## Single-phase protection and trial boundaries

- Existing firmware registry, default resolver, profile ID, V1 binding and
  checkpoints remain unchanged. No existing device changes mode on update.
- Explicit trial consent creates a separate source-bound, versioned community
  binding. No legacy checkpoint is migrated or overwritten. Account, physical
  meter, grid, firmware and accounting policy remain bound.
- The qualified three-phase registry is still empty. Community declaration means
  permission to try this mode; it does not verify physical wiring, meter accuracy,
  timing or utility interval policy. No hardware acceptance gate is passed.
- Trial authority expires after 90 seconds without fresh owned readback. The
  context refreshes normally every 60 seconds. Renewal keeps its binding; revoked,
  changed or failed readback blocks writes. Packet freshness remains five seconds.
- Complete CT1 powers plus matching total in one accepted frame are required.
  The common delivery guard rejects retained/duplicate/reordered deliveries;
  restarts/gaps anchor again and do not backfill downtime.
- No new controls, battery operations, pairing of other roles, public routes or
  automatic diagnostic uploads are introduced. The existing reserve bridge remains.

## Feedback during ordinary use

Use existing **Show integration support report** in app settings. The
`dualCtCommunityTrials` section contains bounded local event counts, eligible
interval duration, rejected gap duration and recovery/delivery classifications.
It contains no powers, energy totals, serials, device/account IDs or timestamps.
It resets on app restart; nothing is sent automatically. Counts/durations are
engineering observations, not measured interval coverage or accuracy. Those
results remain unknown until compared with a suitable independent reference.

For an initial feedback message, the useful minimum is:

1. App version, actual current meter firmware, and whether pairing/availability
   succeeded. Do not send account details or a full raw diagnostic log.
2. Whether Homey's signed property power follows the native grid total during
   ordinary import/export, especially naturally opposing phase flows. No induced
   load, charging task or wiring change is requested.
3. The `dualCtCommunityTrials` section only, plus any approximate observation of
   missing readings/recovery. Review before sharing; private messages are suitable
   for any further household evidence. Do not post full household reports publicly.

A later aligned independent import/export interval comparison, native recovery
and exact-runtime 48-hour observation are still needed for full-release signoff.
No repeated generic capture has been requested from Robert and no community
message has been sent by this implementation work.

## Software verification

Regression coverage includes default single-phase binding/precise checkpoint
restore, actual community pairing/native Add consent, real driver/session netting,
renewal/recovery, CT2 isolation, expired/forged/changed authority, rejection of
legacy checkpoint migration, local feedback filtering and desktop/mobile pairing.
Full hardware readiness stays blocked. CI, archive, Test publication and installed
readback are recorded separately in the latest handover/status checkpoint.

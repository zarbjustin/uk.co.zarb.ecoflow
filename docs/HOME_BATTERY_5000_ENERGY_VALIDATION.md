# Home Battery 5000 Energy qualification

29 October 2026. Diagnostic source 1.10.60; not installed or published.
Runtime fingerprint `a4e8e24c39d77037971706359e8848680e4fed92a3aa01e4c985ba6e028a42fc`.

## Subsequent approved installation outcome

The owner approved 1.10.60 and one ES21 aggregate. Installation completed at
22:00:49 UTC; preservation then triggered the stop condition before the pairing
gate was enabled. No aggregate was added. An original-unit role/capability change
is consistent with the owner's reported relinking and current main-identity API;
the office meter also decreased about 1 Wh. See newest STATUS/monitoring RC.
Source 1.10.61 fixes the confirmed meter startup floor defect and is not installed.
The next bounded step below now needs that candidate's own reviewed archive and
approval; the original 1.10.60 approval is not permission to install 1.10.61.

## Work completed

Nine added lifecycle regressions exercise the real device class: rejected future/
stale/older power, expired intervals, explicit missing power, failed/slow power
writes, checkpoint floors, unrelated failed readings, invalid projected counters
and a failed counter projection followed by zero-power recovery. Seven of these
failed against the prior implementation. Fixes account only successfully applied
fresh power, break unknown-power continuity, cap integration gaps at the battery
power freshness limit, restore the greater valid checkpoint/projected counter,
and retry counter projection without inventing extra energy. Original STREAM and
Dual CT accounting are unchanged. The native-upgrade ledger reference now matches
its heading; the prior dotted heading failed the existing reference test.

EN/DE/NL status/settings copy now separates battery monitoring, Homey Energy
contribution and managing battery settings in EcoFlow. Account pairing and the
unit introduction use the same distinction. Diagnostic research copy retains its
accurate monitoring/consent limits. No control capability, Energy permission,
pairing gate or stored setting was enabled or removed.

Locked Node 22 dependencies, **1165 tests**, lint, release/diff checks, audit zero
and pinned Homey CLI 4.5.3 verified validation pass. The exact archive has 1978
files, 10450401 bytes and includes production MQTT dependencies; root
app/package/lock bytes match source. SHA256 `6a4ccf09037faf4e8c43e11cfdf2600dc290f29412894f2154b58028aed20e50`.
Software checks do not accept the open native Energy gates.

## Current hardware scope

Owner explicitly confirms no panels connected directly to the STREAM 5000 PV
inputs. This scopes this installation's battery tests; it does not accept the PV
accessory or dedicated generation role for other installations.

Read-only native EcoFlow at 21:50:31 UTC showed the house battery at 0% and 0 W;
Homey at 21:50:38 UTC agreed, with a fresh live unit feed. Private exact-serial
comparison at 21:51:23 UTC confirmed the paired ES21 in the native system. Native
membership lists that STREAM 5000 and Dual CT; original batteries are offered for
linking, not members. No Link/Unlink action was taken. These observations apply
only to installed 1.10.59 / e0216df1…6bc2d7b, physical-unit role, this configuration.
They do not qualify 1.10.60, charge/discharge, combined power or Energy counters.
No 5000 aggregate is currently paired. Original office battery remains separate.

## Next bounded native step

After owner review of the exact archive and green exact CI:

1. Capture a fresh private preservation baseline and deliver this archive non-clean
   as Development. Keep existing identities, histories and complete Flow definitions.
2. Enable only the existing Home Battery 5000 pairing gate, then add exactly one
   installation-level battery represented by the already paired ES21 in the house
   system. Keep the physical monitor and original office aggregate. Do not link
   original batteries or change any grid-meter inclusion/exclusion.
3. Read back the expected single new device, existing definitions/settings/Flows/
   counters, actual battery Energy metadata, SOC, signed watts, cumulative charge/
   discharge and desktop Energy display. Review mobile display separately if this
   interface cannot expose it. Check it contributes once; the unit contributes none.
4. Observe native and Homey values in matching windows. At empty standby there
   should be no charged/discharged increment. This point alone cannot accept
   nonzero accounting. Record sample ages, timestamps, units and battery/system
   scope, not a comparison of grid or inverter watts with battery watts.

This step enables a new Homey Energy contributor and restarts integration readings;
it requires specific deployment/pairing approval under AGENTS.md. It sends no
battery-control commands. No additional restart, silence/reconnect, Flow execution,
physical setting/task, rollback or store publication is part of this step.

## Remaining acceptance before ordinary pairing

- Matched native charge/discharge/idle transitions and nonzero charge/discharge
  interval energy on the actual aggregate. At 0% with no direct PV, a bounded
  attended charging test may be needed. Prepare exact starting settings, limit,
  duration, stop/restoration and comparison method for separate owner approval.
  Do not reuse the 27 October test approval or its older-runtime results.
- Establish what each native energy counter measures before comparing it with
  battery-power integration; daily AC/household totals are not interchangeable.
  Set comparison tolerance from sampling/display resolution and observation skew
  before the test. Retain raw evidence privately and public conclusions only.
- Natural expiry/recovery, native counter persistence, a separately approved
  restart/rollback test, no downtime fill and no loss of projected totals.
- Candidate desktop/mobile pairing, duplicate/overlap prevention and correct
  Energy/capacity presentation. Current discovery deduplicates representative
  serials, not proven installation groups: linked installations require an
  explicit identity/admission design before ordinary multi-unit pairing claims.
- Exact ES21/ES22 and system/accessory scope. Owner's single ES21 cannot sign off
  ES22, linked packs or direct PV; either acquire justified evidence or review a
  narrower supported release scope without deleting existing device history.
- Once qualification supports ordinary pairing, remove the temporary settings
  checkbox and its separate opt-in step in source. Keep one-per-installation
  guidance and duplicate/overlap safeguards in normal Add device. Preserve old
  stored setting compatibility and existing device operation.
- Freeze that final candidate, repeat affected native checks against its exact
  fingerprint and complete at least 48 hours of normal-use observation. No soak
  pass is inherited from the earlier gated candidate or the short idle window.

Mainline, Test and Live remain unchanged. Dual CT property Energy is a separate
qualification/transition and remains disabled. No acceptance status is promoted
by this document. See the monitoring RC/ledger for exact historical evidence.

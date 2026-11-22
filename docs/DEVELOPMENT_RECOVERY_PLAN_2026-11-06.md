# Development recovery review and maintenance proposal — 6 November 2026

## Outcome

**Recovery preparation completed offline; no installation or household operation.**
The missing recovery evidence is not solved by merely scheduling a new cloud
backup. Fresh owner approval and physical assistance are required for the
supported full USB backup route. Full public release remains NO-GO.

## Verified documentation and local evidence

Official Homey documentation, accessed 6 November 2026:

- [Back up and restore Homey Pro](https://support.homey.app/hc/en-us/articles/12402204219164-Back-up-and-restore-Homey-Pro): devices, Flows, Insights, variables, alarms, settings and radio networks are backed up, but apps installed through developer tools are excluded. The article does not establish complete restoration of this Development app's private device stores. Cloud restore itself requires factory-reset/setup; it is not a surgical app rollback.
- [Connect Homey Pro to a PC or Mac with USB](https://support.homey.app/hc/en-us/articles/7263435817116-Connect-Homey-Pro-to-a-PC-or-Mac-with-USB): the USB Tool creates/restores a full .homeyprobackup including settings, apps and system software. Entry requires unplugging Homey and entering Recovery Mode. This interrupts the whole hub, not only EcoFlow.

The existing successful cloud-backup timestamp (02:39 UTC) remains dated
metadata from the authorised preflight; no new household query was made here.
The existing snapshot has 15 EcoFlow devices, with no device-store property
exported. Inspected installed local Homey API specifications expose no public
per-device persistent-store export or Development-app download operation.
This is a limitation of the inspected interfaces, not proof no other supported
Athom facility exists. No hidden endpoint or write-to-inspect operation tried.

Public source comparison: original battery version-1 coherent checkpoints gain
four optional ambiguity/history-incomplete booleans. Prior compiled driver lacks
those fields and its reset-on-decrease policy; writing with it can erase warning
state or reinstate inflated accounting. Same schema version does not authorise a
downgrade. Source quarantine/projection fixes likewise do not justify rewriting
unknown stores. Retain both archives, but never automatically downgrade/reset.

## Exact owner-reviewable maintenance proposal

Target: Justin's Homey Pro, currently running EcoFlow Development. Candidate
source 2938c5224b24db6063f050925c691f45de04b01c; archive SHA256
 d4d0305c3bdd0d132f0b769e80da094d2cd2e8719d2b1cfcfa7062134d8809e5.
This proposal does not install that candidate.

1. Agree an attended USB-backup window. Confirm exact Homey model/tool support,
   USB-C connection and owner access. Repeat only time-sensitive read-only
   ownership/intent/lock/task/checkpoint checks immediately before shutdown.
   If any uncertainty or active session appears, defer rather than manufacture
   idle state. Native AI must remain owner and both Homey execution switches off.
2. Explain whole-hub interruption: Homey readings, integrations and automations
   pause while powered off/in Recovery Mode. EcoFlow AI settings stay unchanged;
   no independent assurance of every third-party automation is implied.
3. Owner disconnects Homey power, connects it to this Mac as documented while
   holding its reset pin to ENTER RECOVERY MODE only. Opening recovery is not a
   factory reset. In the official USB Tool select **Create Backup** only.
   Do not select Restore, Update Software or Factory Reset.
4. Save the resulting full .homeyprobackup in a restricted local folder on this
   external disk outside Git/cloud sync. Record completion, file size, SHA256,
   exact device/model and snapshot time locally. Do not open its private contents
   in a hosted model, upload it, or claim a successful restore without testing.
5. Reconnect normal power and verify running state, identities, definitions,
   settings, Flows, Insights, Energy, counter floors and disabled execution with
   a fresh read-only baseline. Record restart and gap; no auto-repair, settings
   change, reserve restoration or forced reconnect.
6. Review the backup receipt and new baseline. A full image is a recovery option
   at its snapshot time, not continuous backup. It rolls back the entire hub and
   can lose later counter/history/automation changes. Restore always needs its
   own exact remedial approval; no automatic restore or old app downgrade.
7. Only after prerequisites are reviewed, request separate exact-candidate,
   one-time non-clean Development installation approval and bounded startup/
   preservation observation. Backup approval is not installation authority.

If the owner cannot take Homey offline, defer installation or investigate a
separately scoped vendor-supported live export/recovery route. A new diagnostics
endpoint would need new engineering and its own installation; it cannot recover
the currently installed private stores retrospectively. Do not waive this gap
or infer raw anchors from rounded capabilities.

## Remaining limits and follow-on

Full USB completion can establish retained full-image recovery material with
public documented coverage; it is not an independently inspected precise raw
checkpoint checksum, proof of restorability or backup coverage acceptance for
all model/firmware combinations. Keep those claims separate. If exact live
store proof remains mandatory, resolve supported access or explicitly review a
revised acceptance requirement before installation; do not silently mark it met.

After separately approved installation/preservation: owner-assisted native model/
role comparisons, independent three-phase community qualification, exact-runtime
48-hour observation and permission/product decisions remain. No soak started,
no tester contacted, no channel or permission changed.

Only sanitised documentation and external receipts changed. Existing local
preflight documentation preserved. No new source tests warranted for this
read-only documentation task; whitespace checks and shared-index refresh only.

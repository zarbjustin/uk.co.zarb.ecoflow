# Development 1.11.21 native/system-scope comparison — 6 November 2026

## 6 November 2026 20:33 UTC — native accessibility resolved; bounded discharge comparison

This supersedes the earlier native-access blocker and pending manual-read request
below. The owner asked for another app check. The actual running EcoFlow wrapper
instance was accessible; the installed launcher path was not the active instance.
No application restart/reinstallation,security change or alternate software used.

Read-only native observations now establish:

- The House battery sheet lists both privately matched units as one system.
- Native Specifications for the second unit explicitly says EcoFlow STREAM5000;
  it is a full STREAM5000,not assumed to be an expansion battery. Individual
  pages show1X/5kWh; firmware version was not inspected and no update control used.
- The second unit's native SOC matches Homey in a bracketed observation window;
  both report discharge. Watts are close across different receipt/update times,
  not an independently synchronised accuracy pass. No tolerance chosen after
  observing results. Charge,idle and simultaneous active-unit scope remain open.
- The main unit's native SOC is consistent with Homey across separate observations.
  Its inspected unit overview/battery-information popup provides SOC/capacity/
  temperature,but no explicit battery watts/state. Grid port zero and absence
  of an AC reading cannot be converted into signed battery zero or idle.
- Native system SOC matches Homey. Homey system discharge watts fall between
  the native power observations bracketing its read. Homey negative watts agree
  with native text Discharge. This supports current display/direction agreement,
  not every linked topology,physical measurement timestamp or interval accuracy.

The initial unit battery popup had no usable accessibility content. A live
read-only screenshot of that popup was viewed solely to read battery information
and locate its close button; no raw screenshot was saved,committed or reposted.
Full identifiers,credentials and historical private images were not read. Other
native observations used accessibility text; identifying strings were masked in
Specifications output. All navigation was display-only; no power button,mode,
reserve,task,unlink,brightness,UPS or firmware-update control was used.

Fresh local API reads confirm running Development1.11.21,unchanged disabled Homey
execution and native intelligent_plus with fresh empty tasks. Store readback at
20:33UTC confirms Test1.11.21/build88 and Live1.10.3/build18 unchanged. No control,
settings,Energy/Flow,installation,restart,publication or external contact.

**Current result:** native access/display comparison is no longer blocked.
Current discharge/SOC observations are documented. The main unit's signed-power
qualification is still open; unknown is consistent with the inspected native
surface,but absence of a native field does not prove hardware idle. No per-unit
sign inference,source patch or new release/runtime was justified or applied.
No acceptance gate was marked passed and no48-hour soak started.

Next bounded work: ordinary native/Homey charge,idle and linked-unit observations
with agreed scope/tolerance. Where signed per-unit evidence is unavailable,retain
that limitation and obtain an authoritative contract or explicit product-scope
review; do not silently waive the existing acceptance requirement. Any narrower
system-only observation must be named separately from full acceptance soak.

Detailed values/timestamps and local private evidence:
../work/output/native-ui-comparison-1.11.21-20261106T202916Z/FINAL_RECEIPT.md.


## Outcome and authority

**Bounded official-API/Homey system agreement observed; physical unit signed-power
qualification remains OPEN. No 48-hour acceptance soak started.** Owner authorised
read-only native comparisons/scope investigation,keeping Test,Live,battery settings
and EcoFlow AI unchanged. No source fix,installation,restart,settings,Energy/Flow,
pairing,task/reserve/control or tester communication occurred.

Source remains a77d22ffd8ebcf44e78093443494af4e759fcfa3; installed1.11.21 confirmed
running. Candidate provenance is the preceding exact delivered/Test88 archive,
not independent installed-file rehash. Existing uncommitted installed-result and
handover documents were preserved under the shared editing lease.

## Evidence kept separate

- **Native desktop access:** resolved the running EcoFlow application by its actual
  installed path after name/bundle ambiguity. Native accessibility capture timed
  out; no usable native UI state or screenshot was obtained. No alternate app
  copy,force-quit/restart,settings change or unsupported capture route used.
- **Homey web:** existing account sign-in succeeded; read the aggregate battery
  detail view,including SOC,power/state and Intelligent Mode+. No UI control or
  setting touched. This is Homey UI evidence,not independent native evidence.
- **Installed telemetry:** bounded direct-local read-only manager/support reads
  show two ES21-family physical records and one aggregate. Main physical record
  has active fresh SOC/temperature/configuration but linked unit-power warning;
  another record has live candidate power. Live status alone does not establish
  physical pack scope. No fields borrowed across identities.
- **Official Developer API:** existing credentials stayed in local process memory,
  never printed or saved into model/Git. Used only existing GET device-list,
  main-identity and latest-quota methods against configured EcoFlow host. No
  command,selected-quota POST,new subscription or credential/permission change.
  Both paired ES21-family identities match inventory and resolve to the same main.
  This verifies current cloud installation grouping,not native physical model/
  wiring,firmware or every field's measurement age.
- **Matched system comparison:** Homey inventory before and after one uncached
  official system quota read spans502ms. System SOC and signed battery watts
  match exactly across both Homey reads and official quota. This is a bounded
  display/protocol agreement; hardware measurement time is unknown. No numeric
  accuracy tolerance or hardware-energy pass was selected after seeing values.

Only sanitised outcomes are in Git. Actual values,masked identity correspondence,
precise window timestamps and raw private originals stay in the external private
receipts below. Official API and app-protocol transport may share upstream cloud
state; agreement does not independently certify physical freshness/accuracy.

## Why physical power remains unknown

The mapper distinguishes system f11/f12 flow from serial-attributed repeated
unit records. It latches peer evidence; a linked physical monitor clears signed
power/state instead of copying system power. Captured f54 per-unit power is not
verified for signed direction/scale,so its magnitude cannot supply a charging/
discharging state. Source references: lib/streamAc5000Mapping.ts,
lib/streamReporterEvidence.ts and lib/Stream5000UnitDevice.ts.

A fresh serial-attributed SOC/temperature confirms working subscription,not
signed physical power. In this read-only run the main physical power/state
absence is explained by the linked-scope guard,not a proven lost subscription.
The other unit's live signed candidate also requires independent qualification;
its availability must not be promoted to physicalScopeVerified.

The returned official quota has11fields and no qualifying per-unit signed-power
contract. Resolving a member to main and reading main quota supplies combined
system metrics. Applying that result to individual physical power would violate
scope. No confirmed field mapping fix or sign inference is justified from these
observations alone. No runtime change was made to hide the warning.

## Required owner/native evidence and bounded follow-on

A targeted owner request is pending: native House system SOC,battery watts/state,
then individual pages for both privately matched units,time and second-unit model/
expansion role. Missing native individual watts/state must be recorded as absent,
not inferred from the system overview. Do not expose full serials in public output.

1. With those observations,collect a tightly bracketed Homey/native comparison,
   keeping exact physical identity,scope,units/sign and observation skew separate.
   Compare only ordinary operation; no reserve/mode/task/artificial load change.
2. Establish which native fields are physical versus combined. If unit signed
   power is absent natively or ambiguous,retain unknown and request an authoritative
   per-unit contract through a separately approved channel,or review an explicitly
   limited feature/release scope. Do not weaken the current gate or imply the
   limitation was fixed. One discharge observation does not qualify charge/idle.
3. Observe natural charge/discharge/idle when available. Agree any quantitative
   native/instrument tolerance before new acceptance collection. Period energy
   comparisons need independent window-aligned native totals; integrated Homey
   watts are not an independent reference.
4. After applicable scope/model preservation and native comparisons are reviewed,
   agree exact start/end/cadence and coverage for a separately approved48-hour
   acceptance soak. A narrower background diagnostic observation is different;
   neither was started here. Single-phase and ES21 cannot close three-phase/ES22.

All 5000/Dual CT hardware ledgers unchanged. Full release remains NO-GO. Test88,
Live18,AI ownership and disabled Homey execution remain the latest observed state;
no new store operation was performed. The initial read checked the current app,
idle coordinator and unchanged disabled execution. No late bulk snapshot was
repeated solely to restate unchanged facts.

## Local receipts and continuation

External directory:
../work/output/native-comparison-1.11.21-20261106T192629Z/

COMPARISON_PROJECTION,UNIT_CAPABILITY_PROJECTION,UNIT_EVIDENCE_PROJECTION,
OFFICIAL_API_PROJECTION,OFFICIAL_SCHEMA_PROJECTION,MATCHED_WINDOW_PROJECTION
separate Homey/UI/API/unit candidates. private/ contains restricted local raw
captures; never load them into a hosted model. No credentials/private histories
or original images were loaded. Native UI independent comparison remains an
explicit gap; no complete native review or physical gate closure claimed.

No production edits/tests or new full suite run. Read-only helper syntax and
sanitised documentation whitespace checked. Lease/index outcome is in the final
external receipt; no commit/push or automatic soak/observer is part of this task.

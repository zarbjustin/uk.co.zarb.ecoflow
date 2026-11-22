# 1.11.25 experimental Community Test

## Release scope and evidence

On 9 November 2026 the owner requested an actual community Test release and
declined personally performing the pilot and soak. This authorises this scoped
experimental Test beta, not Live, certification, installation on the owner's
Homey, household actions or a claim that the original Sprints 1-2 passed.

The owner hardware pilot and exact-runtime 48-hour soak are **NOT RUN**.
Volunteers who explicitly accept these limitations perform the first hardware
commissioning. Deterministic tests, independent source review, verified package
validation and exact-commit CI are software evidence only. Existing monitoring,
Dual CT, strong THEN and full-release acceptance gates remain unchanged and open
where previously open. This beta is not a full-control release or a pass of
`release:then` / `release:full`.

The new physical STREAM 5000 / AC 5000 reserve-request card is default-off.
Monitoring through app sign-in remains read-only. This card separately needs
Developer API keys and per-device consent. It requests a percentage only, with
reserve already enabled and mode already `SELF_CONSUMPTION`; it cannot switch
reserve on, change mode, start charging, pause output or coordinate BYD.
It can affect the linked installation, not merely the selected unit.
API acceptance is not confirmed application. There is no automatic retry,
restoration, exclusion of external writers or terminal/no-late guarantee.
See [the request-only contract](STREAM_5000_REQUEST_ONLY_RESERVE.md).

Compared with Store Test 1.11.21, this also includes the 1.11.22-24 monitoring
fixes and removal of whole-Homey API permission. Previous in-app cross-app
coordination cannot start; separate owner automation is needed. Saved devices,
Flow identities and history are retained. Dual CT three-phase and aggregate
Energy remain separately consented, unqualified scopes; this release does not
enable them.

## Volunteer commissioning

Use the [Homey Test channel](https://homey.app/a/uk.co.zarb.ecoflow/test/).
Check that the installed version is **1.11.25** before reporting on this candidate.
Keep existing paired devices; do not delete, re-pair, reset counters or enable
Energy to test this card. Record preservation before choosing to update.

1. First check existing monitoring, saved Flows, titles, history and counters
   with reserve requests still disabled. Report regressions before control tests.
2. Read your model, firmware, standalone/linked scope, native reserve and mode.
   If reserve is off or the mode is not Self-consumption, report **ineligible**.
   Do not change unrelated native settings merely to manufacture eligibility.
3. Only if you accept the experimental scope and can safely supervise the
   installation, configure Developer API credentials locally and enable
   **Allow experimental reserve requests** on the physical device. Consent alone
   sends no request. Do not share credentials or screenshots containing them.
4. Choose one small reserve change safe for your installation. Do not reduce
   essential backup protection. Review one isolated, manually run Flow using
   **Request installation backup reserve (no confirmation)**. Do not attach
   loops, schedules, automatic retries, charge/pause or follow-on battery actions.
5. Record the Flow result separately from native reserve readback and its elapsed
   time. Observe other linked units and adjacent mode/task/limit/socket settings.
   Do not infer success from a Homey tile or from charging/discharging power.
6. On uncertain outcome, unexpected scope, changed adjacent settings or a
   monitoring regression, stop testing and disable future Flow invocations.
   Check EcoFlow independently before considering another request. Disabling
   consent aborts local pending work; it cannot undo a possibly submitted command.
   No automatic inverse is sent. Any deliberate return to the original reserve
   is another supervised explicit action, not an assumed guaranteed restoration.

Do not use the card for unattended control. An eligible trial is optional;
monitoring-only and ineligible reports are useful too. A successful volunteer
trial applies only to its reported model/firmware/topology, not every installation.

## Feedback collection

[Open a feedback issue](https://github.com/zarbjustin/uk.co.zarb.ecoflow/issues/new)
with the title `[1.11.25 Test] Reserve request feedback` and this template:

```text
Installed app version / Homey firmware:
Battery model and firmware (no serials):
Standalone or linked installation; affected model count (no IDs):
Monitoring-only, ineligible, or supervised reserve trial:
Native reserve enabled / native mode before trial:
Reserve before / requested / independently observed afterwards:
Flow result: rejected before submit / accepted / uncertain:
Approximate elapsed time to native observation, or not observed:
Unexpected linked-unit or adjacent-setting effects:
Existing monitoring / saved Flows / titles / history / counters preserved:
Steps to reproduce (no credentials or private diagnostics):
```

Keep acceptance, observed application and physical behaviour separate. Do not
post full serials, device IDs, addresses, tokens, account sessions, raw support
reports or household schedules. Use elapsed times rather than private activity
timelines. Review any diagnostic excerpt locally before sharing it.
No community message has been sent by preparing these instructions.

## Draft community announcement - not posted

> Experimental Test 1.11.25 adds an opt-in STREAM 5000 / AC 5000 THEN card:
> "Request installation backup reserve (no confirmation)". It needs Developer
> API keys, reserve already on and Self-consumption. Linked units may be affected.
> Success means the API accepted the request, not that the reserve changed.
> No automatic retry/restoration, charge-now or pause is provided. Owner hardware
> pilot and soak have not been run; this is a supervised volunteer commissioning
> beta, not a fully validated control release. Monitoring-only feedback is also
> welcome. Please keep existing devices and read the commissioning and privacy
> instructions before opting in. Do not use this card unattended.

Publication status, exact source/CI/archive and Test/Live readback are recorded
in the local release receipt and latest canonical handover; this document alone
is not proof that the candidate has been published.

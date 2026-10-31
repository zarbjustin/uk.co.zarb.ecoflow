# Original STREAM freeze investigation — 31 October 2026

This is a source-only candidate after Test 1.11.12/build 79. No publication,
installation, restart, controls, settings/Flow change, repair or re-pair is part
of this investigation. Private reports, household values and identities remain
outside Git.

## Current evidence

The original STREAM AC Pro tester reports freezing continues on 1.11.12, perhaps
less frequently. The earlier report was generated before updating; the latest
manual Homey diagnostic matches 1.11.12, Homey 13.5.3 and Homey Pro mini (2025).
It contains startup and an initial supported-MQTT connection, with no exception
trace, later delivery evidence or field diagnostics. This is a confirmed reported
freeze, not proof of a process crash or a specific source failure.

The iPad/iPhone hypothesis is unsupported: the dashboard code reads existing
Homey capabilities; those reads do not open separate EcoFlow subscriptions.

## Confirmed source defects

1. **Permanent aggregate binding block after transient lookup failure.** Each
   original aggregate poll freshly resolves its main unit before reading quota.
   A failed lookup sets `aggregateBound = false`; the old guard also rejects
   every later successful lookup simply because that flag is false. MQTT quota
   is then ignored as well. The source can stay blocked until reinitialization.
   A regression against the published build verifies one initial quota read,
   transient failure and successful same-main lookup, but no second quota read.
2. **Credential refresh occurs too late.** Base polling refreshes rotated API
   credentials, but STREAM's prerequisite main lookup ran first. If the lookup
   failed using the old client, the base refresh was never reached.
3. **Availability could contradict the binding gate.** Incoming MQTT activity
   could mark the device available even though blocked quota application returned
   without updating capabilities. The candidate keeps that device unavailable
   until the source verification gate permits telemetry.

These are reproduced implementation failures. The diagnostic does not establish
that any of them caused the tester's exact event.

## Candidate behavior

- Remember the main identity actually verified and persisted in this initialized
  session. Only a telemetry poll may recover a temporary binding block after a
  fresh successful lookup of that **same** main identity.
- A different original main identity sets a sticky session conflict; later return
  of the former identity does not silently clear it. Initial/unverified bindings,
  foreign-family sources and source transitions are not automatically admitted.
  Normal explicit initialization retains the existing source-binding procedure.
- Refresh API credentials before the prerequisite identity lookup. The base
  refresh remains in place for ordinary polling and other drivers.
- Keep cumulative totals/raw counter baselines and paired identity/settings.
  Clear live/control values while blocked. Counter-source recovery can follow
  existing monotonic counters; power integration starts a new anchor and cannot
  fill the verification outage.
- Control/history checks cannot themselves reopen a blocked telemetry binding.
  Fresh control preflight/readback requirements remain intact; recovery sends no
  battery command. No new polling timer, MQTT reconnect or network endpoint is
  introduced.
- Emit fixed interruption/recovery log classifications and export bounded
  verification-failure/recovery counts in the local support snapshot, without
  identities, exception text, quotas or automatic upload.
- Fence late lookup completion and capability clearing against a changed device
  lifecycle generation. An old poll cannot make a newly initialized session
  unavailable.

## Regression coverage and validation

Six new regressions cover same-source recovery with cumulative counters,
changed-source blocking, credential-refresh ordering, no power-gap integration,
privacy of recovery evidence, and old-session lookup completion. The same-source
recovery case also verifies MQTT availability cannot bypass the block and a
control request cannot reopen it. Existing reconciliation tests still protect
newer MQTT fields/counters, preserve unrelated REST data, and retain original
counter-versus-power accounting behavior.

Node 22 committed-lockfile `npm ci` (zero audit findings), all 1,327 tests, lint,
release boundary/ledger checks and pinned Homey 4.5.3 verified validation pass
locally. This is not exact-commit CI or a hardware acceptance claim. Test, Live,
Mainline and the installed Development app have not been changed. Review the
candidate before versioning/publishing a further Test build; do not ask the tester
to restart/re-pair or submit another generic capture as a substitute for diagnosis.

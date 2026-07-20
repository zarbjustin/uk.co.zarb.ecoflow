# Hardware Verification — EcoFlow STREAM (run on a live device)

A guided pass to confirm the values the app currently infers but can't verify without hardware.
Run each step on your live STREAM, note the result, and (where noted) send it back so the mappings
can be finalized. Nothing here is destructive except the clearly-marked control tests (which are
reversible).

## A. Capability probe (HomeyScript)
Paste the script below into **Homey → HomeyScript** and run it. It lists each STREAM device's
capabilities + values and flags the hardware-gated ones. Report:

```js
/* global Homey, log */
(async () => {
  const APP_ID = 'uk.co.zarb.ecoflow';
  const devices = await Homey.devices.getDevices();
  const streamDevices = Object.values(devices)
    .filter((d) => String(d.driverId || d.driverUri || '').includes(APP_ID));
  if (!streamDevices.length) { log('No EcoFlow STREAM devices found.'); return; }
  for (const d of streamDevices) {
    log('');
    log(`=== ${d.name}  (${d.driverId || d.driverUri}) ===`);
    const caps = d.capabilitiesObj || {};
    for (const id of Object.keys(caps).sort()) {
      log(`  ${id} = ${JSON.stringify(caps[id] ? caps[id].value : undefined)}`);
    }
    const flags = [
      ['self_heating', caps.self_heating !== undefined],
      ['measure_power.pv3', caps['measure_power.pv3'] !== undefined],
      ['measure_power.pv4', caps['measure_power.pv4'] !== undefined],
      ['measure_power.schuko1', caps['measure_power.schuko1'] !== undefined],
      ['measure_power.schuko2', caps['measure_power.schuko2'] !== undefined],
    ];
    log('  -- of interest --');
    for (const [name, present] of flags) log(`  ${name}: ${present ? 'PRESENT' : 'absent'}`);
  }
  log('Done — copy the output above.');
})();
```

Report:

1. **Self-heating** — is `self_heating` **PRESENT** (ideally checked on a cold unit)? If present,
   what value? (Confirms the self-heating field is mapped; if it stays absent on a cold unit, the
   candidate field list in `lib/streamMapping.ts` needs the real key — capture the app log.)
2. **Per-socket power** — do `measure_power.schuko1` / `.schuko2` show sensible watts with a load?
3. **STREAM Max (BK41) PV inputs** — on a STREAM Max, `measure_power.pv3` / `.pv4` should be
   **absent** (the app now models 2 inputs). Confirm PV1/PV2 report under sun.

## B. Device-tile checks (in the Homey app)
- STREAM Max: confirm **no empty PV3/PV4 tiles** (should only show PV1/PV2 now).
- Confirm the 25 capability icons render (battery, reserve, feed-in, grid, solar, etc.).
- Solar Forecast: with a location set, confirm `Solar forecast today/tomorrow` populate within a few
  hours and read plausibly; tune the **Solar forecast factor** setting until "forecast today" tracks
  your actual `Solar today`.

## C. Control tests (reversible — note current values first)
- **Backup reserve 8524-safe path:** set `Discharge limit` to e.g. 20%, then set `Backup reserve`
  to 5% (or run *Release battery for export now*). It should succeed and the device should actually
  discharge — the app lowers the discharge limit first and verifies. If it errors, capture the
  message.
- **Grid threshold triggers:** create a test Flow on *Grid import rises above 50 W* → notification;
  confirm it fires when a load starts.
- **Electricity price:** run *Set current electricity price* → -1 with your price unit; confirm the
  *Electricity price is negative* condition is true and the Energy Recommendation widget shows it.

## Report back
Send the probe output (A) plus any anomalies from B/C. Follow-ups will adjust
`lib/streamModels.ts` (BK41), `lib/streamMapping.ts` (self-heating / sockets), and prune the
self-heating candidate list.

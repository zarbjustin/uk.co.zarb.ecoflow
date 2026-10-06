# Sprint 5 — expansion and installation discovery

6 October 2026. Local candidate on `codex/stream-next-wave-test`, source version
1.10.18. This observational increment is not new product support, a release or
a real-hardware validation pass. Preserve the unpublished Sprint 1–4 and ES21 work.

## Evidence and model boundaries

- [EcoFlow's support FAQ](https://www.ecoflow.com/eu/stream-series-plug-and-play-solar-battery/support)
  explicitly identifies Expansion Battery 5000 and Expansion Battery 3000 for
  stacking with AC 5000. It distinguishes physically stacked expansion packs
  from multiple hosts connected through a distributed system. Neither statement
  supplies an API identity, pack-count field or authoritative capacity mapping.
- [EcoFlow's STREAM overview](https://www.ecoflow.com/de/blog/ecoflow-stream-5000)
  distinguishes the smaller standalone STREAM 3000 from the 3000 expansion pack,
  and describes original/new-generation compatibility. Its marketing/software
  statements are not a stable cloud membership or system-identity contract.
- Gateway and [Dual CT catalogue entries](https://uk.ecoflow.com/products/stream-series-solar-battery-storage?variant=54491218936147)
  identify research candidates, not adapters. Do not guess prefixes, copy ES21/ES22
  parsers into unknown devices, or convert advertised ratings into control limits.
- [shuette42's implementation](https://github.com/shuette42/ecoflow-energy-ha)
  corroborates ES21/ES22 monitoring over app-auth transport. The reviewed sources
  do not establish a verified expansion/Gateway/3000 adapter for our app. Retain
  the pinned capture provenance in [model coverage](STREAM_MODEL_COVERAGE.md).
- Local Mode stops cloud uploads according to the FAQ. A local adapter needs
  independently verified transport/authentication; a stale cloud feed is not
  evidence of an empty/disconnected expansion pack.

## Implemented locally

Support report schema **3** adds `streamDiscovery` and anonymous `peerVisibility`.
The report still performs no EcoFlow request, control write or persistence.

1. Observe only the account device list already fetched by beta pairing. Record
   its anonymous summary **before** supported-model/paired-device filtering. No
   extra request, subscription, polling task or sign-in is added. Opening the
   existing pairing list and cancelling is sufficient; do not delete devices.
2. Retain only grouped four-character prefixes, registry model labels, strict
   product-name category hints, online/shared counts and observation age. Never
   retain raw serials, user-assigned names, arbitrary product names, credentials
   or raw responses in this inventory. Unknown/empty product names remain unknown.
3. Prefix identity and catalogue hints remain independent: a STREAM 3000 name
   does not admit an unknown prefix; contradictory product metadata does not
   override a verified prefix. All candidates still pass the existing registry
   and default-off beta gates before pairing.
4. The cache is session-only, capped at 256 input records, case-deduplicated,
   cleared immediately on account/region/password changes and shutdown. Older
   requests cannot overwrite a newer request or repopulate an old-account cache.
   Reports explicitly distinguish unavailable, stale and truncated observations.
5. Serial-keyed peers expose prefix/family and whether valid SOC, raw power or
   PV fields have ever appeared in this runtime session. Their indices are local
   to the report, not stable device IDs. Field flags are historical visibility,
   not current values; fresh peer presence does not refresh an absent field.
6. Peer role, expansion pack count and installed capacity remain **unverified**.
   A record count is not a pack count. Nested packs might never appear in an
   account list or as serial-keyed peers. Absence proves neither independence
   nor missing hardware. Raw peer power has unverified direction and is not
   admitted to Energy, Flow conditions or new tiles.

No automatic grouping, SOC averaging, capacity summation, pairing identity change,
counter/history rewrite, new model driver or control writer is introduced.
Only the installation Home Battery contributes to Homey Energy. Optional physical
monitors remain excluded, including in host-plus-expansion installations.

## Hardware evidence still needed

After an explicitly authorized Test release, use already-configured installations:

| Case | Capture | Acceptance question |
|---|---|---|
| Host + Expansion 5000 | EcoFlow system and host/pack pages; local support report; charging/discharging/idle samples | Does host/system SOC and power already include the pack? Is usable capacity reported in explicit units? |
| Host + Expansion 3000 / two packs | Same evidence with actual configuration noted | Can we distinguish pack types/count without guessing from total capacity? |
| Mixed original + new hosts | Combined and individual pages at the same time | Which source reports the complete installation, and can overlap be excluded? |
| Independent installations on one account | Separate installation pages and report | Can account discovery remain separate from membership? |
| Gateway / Dual CT | Product/model page with identifiers redacted; telemetry through an approved capture path | Is it discoverable separately, and which readings are device-local versus system totals? |
| STREAM 3000 host | Product identity, masked prefix, time-aligned telemetry | Is there a distinct verified adapter contract? |

For a naturally occurring expansion addition, collect before/after evidence only
if the owner was already planning it. Do not disconnect packs, relink systems,
switch Local Mode, reset or change electrical configuration for research. Ask
the owner to describe actual pack types privately where necessary, not publish
full serials or credential-bearing dumps. Anonymous reports cannot establish an
exact membership mapping by themselves.

Compare Home Battery SOC and signed power with EcoFlow's authoritative system
page; compare counter deltas over a measured interval, then restart/reconnect
and 24–48-hour soak. Do not add pack power to an aggregate already including it.
Any new capacity or pack diagnostics require masked captures and attribution
tests before exposure; controls require separate physical readback/limits gates.

## Verification

Synthetic tests exercise categories without claiming their fabricated prefixes
are real, strict privacy projections, case duplicates, truncation, stale/invalid
data, account-change/shutdown races, out-of-order responses and actual pairing
integration with no extra list fetch. Existing protocol/lifecycle and aggregate-
only Energy tests remain required. Hardware evidence, Test deployment and CI
are separate open gates; do not infer them from local checks.

Local combined-candidate verification: **313 tests passed**, TypeScript and lint
passed, full npm audit found zero vulnerabilities, Homey publish-level validation
passed and `git diff --check` passed. No version bump, commit, push, Test upload,
production promotion, live installation or physical/control acceptance occurred.

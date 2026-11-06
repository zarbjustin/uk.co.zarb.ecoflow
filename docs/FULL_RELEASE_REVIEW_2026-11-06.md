# Full-release review - 6 November 2026

## Decision and authority

**Full public release: NO-GO.** Passing software checks is not physical acceptance.
The smallest justified outcome is reviewed diagnostic-branch source maintenance,
not publication or a new installation. Even a 5000 physical-monitor-only release
still fails its model/role readiness checks. No feature or supported identity was
removed to manufacture a narrower green verdict.

| Area | Verdict | Concrete basis / remaining gate |
|---|---|---|
| Engineering readiness | NO-GO for full release | Bounded repairs pass offline checks, but ambiguous native-counter decreases can inflate energy; Developer MQTT backlog remains unbounded under a blocked consumer. Independent field-expiry coverage is incomplete for legacy micro/solar/socket paths. |
| Product/marketing truth | CONDITIONAL | Corrected stale monitoring consent, SOC fallback, counter provenance, cadence and preview claims. Store descriptions are now two plain-text paragraphs in EN/DE/NL. Native scope, translations/accessibility and store-permission eligibility are not comprehensively accepted. |
| Packaging/store preparation | CONDITIONAL | Node 22 lockfile install, audit and pinned Homey 4.5.3 verified validation pass. Validator warns about broad Homey API permission; policy eligibility/core-function justification remains an owner/Athom decision. No submission archive or certification approval is claimed. |
| Installed-candidate validation | CONDITIONAL, dated | The earlier 14:31 Development delivery passed bounded startup/preservation observations, not this new source. No independent installed-filesystem hash, precise interval acceptance or 48-hour soak. |
| Hardware/model/topology acceptance | NO-GO | Physical 5000 power/state scope, independent native comparisons, exact-runtime ES21/ES22 unit/system, Dual CT and three-phase gates remain open. |
| Full public release | NO-GO | Source-policy, store-process/permission and physical gates above; reviewer agreement does not close them. |

This task made no Homey/EcoFlow query, capture, observer, installation, restart,
reconnect, pairing/Repair, settings, Energy, Flow or control operation. No store
publication, version/tag workflow, Mainline change or tester contact. EcoFlow AI
continues to own reserves; both Homey reserve-execution switches stay disabled.
Historical fault/history/state, completed native lease, app gate and resident
runner remain untouched.

## Reconciled baseline and evidence categories

Canonical branch: `codex/mixed-generation-reporting-diagnostics`; initial HEAD
`211e022d1b49dd1fd476b4df61f74d140cd2ce67`. Status/diffs were inspected before a
normal fetch; local/remote were 0/0. Three inherited owner-authorised installation
documents were preserved and deliberately incorporated: CODEX_HANDOVER, STATUS
and COMBINED_COUNTER_VALIDATION_RESULT_2026-11-06. They supersede older
"prepared/not installed" entries, not the reverse.

| Category | Newest usable evidence, kept separate |
|---|---|
| Source | This review's bounded repairs, including common-diff review corrections; runtime fingerprint `eef1aa086c40a513c9f882b7651f1bc1e76b2b4ef278c61a5ee3972e9096db63`. Final committed identity and CI belong in the external receipt. |
| Exact-commit CI | Baseline source `003f2c4aee9c58aeeda7ad907b4c06f1dc8c832d`: [42224824156](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/42224824156); previous handover [42225712067](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/42225712067), both passed. New exact source/final-handover commit CI is recorded outside Git after push. |
| Published channels | Last recorded read-only observation: Test 1.11.20/build 87; Live 1.10.3/build 18. Not queried under this task and not changed. |
| Installed Development | Version 1.11.20, owner-approved non-clean delivery 14:31:51.841 UTC; archive SHA256 `5a8daa62475500e210991ea6428024b703a72b8f7529aa5ce8eca61da30955ff`; runtime source fingerprint `89ad4da2352e91baade7a0f5150688fe2d120faf832901abf62b6875c6e3f1af`. Archive-delivery provenance, not installed-file rehash. |
| Telemetry/readback | Earlier 100 startup samples: no observed decreases in ten cumulative meters; six transient unknowns not zero-filled. Two readbacks retained 15 EcoFlow identities, 101 Flows, 1,217 Insights identities and settings/Energy definitions. Finite cadence cannot exclude unseen shorter dips. |
| Native UI | Owner confirmed phone icons and 5000 battery indicator for that installed candidate. No new UI inspection or whole-widget visual acceptance. |
| Physical acceptance | One 5000 power/state scope unresolved; independent native/interval comparisons and 48-hour soak absent. Historical observations do not automatically transfer to changed runtime source. Acceptance JSONs unchanged. |

Matching version numbers do not identify matching source, archive or channel.
A diagnostic push does not update Homey or certify hardware.

## Independent multi-model process

Actual read-only reviewers were configured as `gpt-6-sol`, `gpt-6-astra` and
`mai-code-2`. Each received the same immutable public baseline and sanitised
requirements. First passes completed independently before findings were shared.
Sol emphasised implementation/lifecycle; Astra semantics/accounting/evidence;
MAI compatibility/privacy/UX, with each also covering other material risks.
The coordinator was the sole canonical writer under lease
`codex:copilot-full-release-9da5154f`.

The configured invocations are real, but upstream runtime/provider endpoints
could not be independently attested. **MAI-Code-2.x1 (Preview) mapping remains
UNATTESTED**; no simulated review or silent substitution is represented as that
mapping. Coordinator is hosted `gpt-6.1-sol`, not local inference. Only public
source, sanitised summaries and synthetic data entered hosted model contexts.
Final common-diff artifact/hash, actual reviewer returns and any disagreements
are recorded in the external MODEL_PARTICIPATION and FINAL_RECEIPT.

## Confirmed defects and bounded repairs

The new regressions first failed against unchanged production. The first run
reported 12 failures; two original-driver fixtures needed correction (explicit
dirty checkpoint and capabilities/actual quota keys). Corrected fixtures were
rerun against the committed original driver transpiled **in memory**, without
rolling back canonical files, and both failed for the intended reasons. Two
additional real pairing regressions also failed on the baseline. Final reviewers
then found four gaps in the proposed repairs: receipt-order loss after partial
PV, widget calculations with one expired floor, persistent configuration-clear
failure hidden by fresh SOC, and original ownership lost during startup/trial.
All four were reproduced against frozen v1 before correction; three additional
tests and one strengthened existing test cover them. Final suite:
**1,488 passing tests**, versus 1,471 at baseline.

| ID / priority | Trigger, cause and impact | Smallest repair and regression |
|---|---|---|
| F1 / P1 | Microinverter reports only PV1 or PV2. `stream_micro/device.ts:applyQuota` treated the absent channel as zero, understating total power and integrated energy while the other channel tile retained its previous value. | Individual reported channels still update; total becomes unknown and the accounting anchor breaks until a complete same-report pair. Accepted receipt order survives that break; older partial/full reports cannot revive an earlier anchor. Explicit zero is valid; first recovered pair does not backfill the gap. |
| F2 / P1 | Store failure during retirement of original STREAM, original Smart Meter or 5000 aggregate. Teardown used checkpoint `flush()`, which owns a retry timer even after the device retires. | Use existing terminal `close()` in all three callers, retaining dirty/failure evidence without retired retry ownership. Real-driver failure tests assert rejection and zero remaining timers/subscriptions. |
| F3 / P2 | Original battery meter SDK write fails, followed by unchanged native counters. Internal totals were correct but change-only projection never retried. | Separate projection from dirty marking; retry accepted counter/integration projections, skip already-correct SDK writes and log failures. Unchanged native-counter regression recovers 10 Wh without adding energy. |
| F4 / P1 | Existing 5000 total is malformed and no usable capability projection survives. `storedEnergyWh` silently selected zero and could overwrite recovery evidence. | Quarantine aggregate accounting, preserve stores/projections and continue live monitoring. Diagnostics show unknown totals. Valid projected floors still recover; genuinely absent new-device state retains existing initial policy. Invalid object/string/negative/infinite fixtures remain unchanged through teardown. |
| F5 / P1 | An SDK rejection while clearing a persisted 5000 optional/configuration/live tile aborted startup before subscription. | Isolate clear failures and continue subscription. Live/configuration failures retain application-failed/unavailable truth; unrelated SOC cannot hide a stale tile. Configuration failure diagnostics persist until successful projection/clear, which alone is not a measurement. Independent failure regressions exercise retry and fresh recovery. |
| F6 / P2 | Socket telemetry contains null/empty/malformed power or a non-binary relay value. JavaScript coercion invented zero/off or on. | Existing finite-number parser for power; only boolean or numeric/string 0/1 relay reports accepted. Both outlet mappings reject malformed reports and retain prior known values. No control executed. |
| F7 / P2 | A widget reads persisted SOC/configuration or missing feed-in evidence while other power is fresh. Missing diagnostics were treated as permission to display/estimate; unknown feed-in became false. | Original session receipt authority now covers SOC/reserve/limits/mode/feed-in, with matching values and independent expiry. Widget requires both applicable floor inputs fresh before usable-energy/calculated-runtime estimates; expiring either cannot silently lower the floor. Unknown feed-in stays unknown. |
| F8 / P1 | Paired aggregate immutable identity A is verified reading main B; pairing offered B as another Home Battery. Duplicate installation Energy became possible. | Expose restored accounting-source identity as private ownership evidence, independently of live routing/trial/binding. Uninitialised ownership fails closed. Reuse cross-aggregate inventory/overlap checks; retain distinct installations. Real-device startup/trial regression preserves identity, source and counter history. No source transfer. |
| F9 / P1 privacy | Unknown protobuf fields can contain private non-serial strings. Redacting known serials before Base64 sampling could not make ordinary diagnostic payloads safe. | Export metadata only: size, command shape, short digest, coarse topic and bounded admission. No reversible raw sample; compatibility sample field is empty. Novel private-string and malformed/linked-frame regressions cover this. Historical logs are not retroactively sanitised. |

Meaningful compatibility coverage includes legacy identities/history/custom
titles, fractional counter floors, original native-counter latch, optional 5000
tiles and freshness recovery, source pairing and current widget behavior.
No new dependency, guessed power, SOC average, automatic source merge or
counter transfer was introduced. Private control-bridge source was reviewed
without enabling or exercising it.

## Unresolved findings and rejected changes

| ID / priority | Evidence and disposition |
|---|---|
| U1 / P1 | Original raw counter sequence **1000 -> 1010 -> 1005 -> 1015 Wh** produces **1025 Wh**, versus 15 Wh absent a true reset. `followResettableCounter` treats every decrease as reset-to-zero. Receipt time alone cannot determine measurement order. Need an explicit source/order/reset-confirmation policy and genuine-reset regressions; no guessed reset threshold or power substitution was added. Full-release blocker. |
| U2 / P1 | Actual Base Developer queue with one held consumer retained **10,000** later submissions and eventually applied all 10,001. Measured enqueue 3.468416 ms; observed heap delta 5,555,496 bytes, not a peak or GC-controlled bound. Bounding/coalescing needs a policy preserving counter order, receipt provenance and energy discontinuity. Existing optional bounded queue does not fix this different queue. Full-release reliability blocker under stalled-consumer fault. |
| U3 / P2, qualification gap | Legacy solar/micro/socket direct tile paths do not uniformly implement independent live-field TTL. Unrelated MQTT can keep a device healthy while old power remains. Source-supported coverage gap, not new physical evidence; complete per-driver expiry/failure recovery qualification next. |
| U4 / P2 process | Manual publish/version workflows have no explicit exact-source/hardware prerequisite. They are manual-only and were not dispatched. A full-release gate added indiscriminately could block separately scoped Test releases; owner must choose release scope/policy before workflow change. |
| U5 / P2 product/UX | Broad API permission is required for optional cross-app coordination but faces additional Homey review/restrictions for branded-device apps. Pairing has inline English/accessibility gaps; all locales, phone layouts and image captions have not had native visual acceptance. Do not remove existing supported functionality merely to hide these gaps. |
| U6 / P3 | Smart Meter source-title updates may overwrite custom titles; exact known-default migration contract needs a separate bounded regression. Cancelled pairing retains already validated app-wide Developer credentials by current shared-login design; changing cancellation transaction semantics must not erase credentials used by other devices. Socket command completion before physical readback also needs a separately reviewed control contract, not live exercise here. |
| U7 / P2 | MAI retains a cloud-latest SOC freshness concern: Developer fallback has receipt/request age, not a hardware measurement timestamp. Source diagnostics explicitly say `hardwareFreshnessVerified:false`; this does not prove a current physical SOC or eliminate stale native UI risk. No vendor measurement-time evidence was found and no blanket fallback removal was justified. The policy/native-UI qualification remains unresolved, not reviewer consensus or hardware acceptance. |

Rejected/qualified proposals: per-direction power fallback after a native counter
is deliberately rejected because the authoritative-counter latch prevents
double-counting, including after clearing a sole raw anchor. The conservative
whole-REST guard is intentional outside drivers with a field/source contract;
do not weaken it generically. Cloud latest-report SOC fallback explicitly has
no hardware timestamp: retain provenance and limitations, not invented native
freshness or an unsupported removal. Explicit consented three-phase community
trial availability is not hardware acceptance, but is not an accidental ungated
driver or authority to remove IDs. Existing preview artwork is purpose-built,
transparent and text-free; the stale README wording, not the images, was fixed.

## Product claim-to-evidence matrix

Locations below identify exact text/feature groups and implementation contracts,
not a blanket claim that every marketing sentence is physically verified.
"Installed evidence" always refers to the earlier fingerprint `89ad4da2...af`,
not this review's changed runtime. Firmware/topology not named in a row remains
unqualified; no generalisation to all regions/firmware is implied.

| Exact claim / location | Applicable scope and implemented behavior | Software / native evidence | Verdict and correction / remaining validation |
|---|---|---|---|
| "one per STREAM installation (main SN)" - README Features, `stream/driver.ts` | Original registry, Developer account region; one aggregate/main, separate unit monitors. | Pairing/grouping and new bound-source overlap regressions. Earlier identity preservation, not every topology. | Qualified; active-source duplicate fixed. Reassignment/overlap hardware validation still needed. |
| "Per-unit monitors ... without contributing separately to Homey Energy" - README; unit driver manifests | Physical original and ES21/ES22 unit roles, not whole installation. | Manifest Energy exclusion and boundary tests. One physical 5000 scope remains unresolved. | Supported software boundary; physical power scope unverified. |
| "guarded settings controls" - README; original Flow cards/capability picker | Original STREAM supported commands; no guaranteed physical wattage. | Command/readback/generation tests and source contracts, not new live commands. | Qualified. Native schedules/limits apply; historical commissioning gates remain. |
| "no 5000 command is sent" - README; 5000 driver/configuration capabilities | Captured app-protocol monitoring/configuration, separate from private original reserve bridges. | Writer/admission and release boundary checks; capabilities are read-only. | Supported implementation; does not mean entire app is read-only. |
| "needs no Beta switch or Energy opt-in" / "separate, default-off" - README and settings | ES21/ES22 unit monitoring versus once-per-combined-installation aggregate consent. | Pairing/settings gates, preserved legacy behavior. | Corrected stale footer; old Beta flag is not aggregate consent. No installation/publication implied. |
| "optional ... system battery level" - README/store prose; 5000 SOC fallback | Configured Developer credentials and matched main identity; system SOC only. | Scoped REST fallback tests; official 5000 quota docs. No new independent native timestamp. | Corrected "no Developer REST fallback". Latest-report provenance, not power/configuration fallback. |
| "imported/exported energy ... derived from observed grid power" - README Smart Meter | Original CT_EF_01 and accepted CT1 Dual CT; excludes unseen gaps/native candidate adoption. | Integration/receipt/startup tests. Native interval comparison open. | Qualified estimates. Removed unverified universal "API has no kWh" assertion. |
| "model 421/firmware 1.0.0.41", single phase/default, explicit three-phase trial - README/store and Dual CT pairing | CT1 property incomer; community three-phase consent, one configurable driver. | Admission/accounting-mode tests and qualification ledger. | Qualified, not general three-phase production acceptance. Hardware/normal-use gates open. |
| "CT2 ... not added to property grid totals" - README; Dual CT driver/settings | Optional circuit channel, possibly battery+solar exchange. | CT1-only Energy boundary tests. No new CT placement query. | Supported software exclusion; installation wiring/scope needs owner validation. |
| "display ... never the accounting mode" - README; paired Energy mode setting | Existing Dual CT binds accounting at pairing; display-only phases independent. | Migration/settings regressions. | Supported implementation; preserve devices/history, no re-pair by default. |
| "Missing/expired inputs stop evaluation, including inversion" - README Automation; Flow helpers | Cards with validated receipts, not proof every legacy direct tile has TTL. | Legacy/5000/forecast/coordination Flow tests. | Qualified Flow claim; U3 prevents blanket all-telemetry-freshness claim. |
| "stored and usable kWh ... estimates time to empty" - README/widgets | Selected aggregate, optional capacity, accepted SOC/floors, discharge >50 W, efficiency default 92%. | Widget arithmetic and fresh/unknown/expiry regressions; no new phone rendering or native capacity acceptance. | Qualified estimates; fresh inputs required. Capacity does not set Homey Energy capacity. |
| "device-reported fallback" - README/widgets | Available reported remaining time, otherwise unknown. | Runtime selection tests; no new native comparison. | Qualified, not a guaranteed available value. |
| "~2 s" / "real widget HTML" - previous README Under the hood/widgets | Cloud cadence variable; preview generator produces simplified artwork, not screenshots. | Source and generator inspection, image validation. | Stale wording corrected; no hardware latency or screenshot claim. |
| "GET-only and default-off" - README coordination | Selected cross-app observation path; session may trigger existing user THEN actions; not all app endpoints. | Consent/source/session tests and API source, manifest broad permission. | Qualified functional claim; permissions/policy decision open, no automatic control implied. |
| "Reports stay local" - store prose; settings/support | Explicit display/copy/download; schedules/energy patterns may reveal household activity. | Support allow-list/bounds tests; metadata-only raw-frame repair. | Qualified, not anonymous-all-data or safe-to-share-all-logs guarantee. Historical logs require review. |
| "English, German and Dutch" - README; manifests/locales/settings/pairing/cards | Locale resources present; some inline pairing English/accessibility gaps remain. | Source inventory/locale structure and validator, no exhaustive linguistic/visual acceptance. | Qualified resource availability, not complete native localisation certification. |
| App name/tagline, model names, capability titles and image assets - compose/generated manifests | Independent integration, Homey Pro local SDK3 >=12.4.0; source registry rejects unsupported accessories. | Generated manifest/asset verified validation and preserved IDs; no vendor endorsement evidence. | Qualified marketing; independent relationship stated. No EcoFlow/Athom endorsement claimed. |
| Store plain-text descriptions - README.txt/de/nl | Role, credential, consent, estimated-counter and accessory limitations retained in two paragraphs. | Official Homey prose guidance and validator. Native translation review absent. | Corrected format; not store-submission approval. |
| Release notes/checkpoints - docs/STATUS, inherited installed result | Dated source/CI/channel/delivery/physical observations, not current blanket production claims. | Exact historical identifiers retained; new sync receipt outside Git. | Historical/qualified. Source sync does not install or accept hardware. |

## Authoritative documentation checked

Access date **6 November 2026**, public anonymous context only:

- [Required EcoFlow STREAM5000Series path](https://developer-eu.ecoflow.com/us/document/PP3?id=2115695633708867585):
  initial text fetch was only a SPA shell; Chromium actually rendered the page
  at 15:35:05.540 UTC, HTTP 200. It documents main-SN resolution, selected quota
  get/set, quota/all, history and MQTT for 5000/5000AC. Grid positive means import;
  battery positive means charge; system metrics use main identity, socket commands
  use the owner. Fields may be absent. UTC period history is not a lifetime meter.
  Battery history labels still need confirmation. This does **not** make captured
  app protobuf, Dual CT 421, all firmware/access, freshness or installation
  topology officially supported. Public vendor example identifiers remain in the
  external receipt only, not copied into Git.
- [Homey guidelines](https://apps.developer.homey.app/app-store/guidelines),
  [publishing](https://apps.developer.homey.app/app-store/publishing),
  [permissions](https://apps.developer.homey.app/the-basics/app/permissions)
  and [Energy](https://apps.developer.homey.app/the-basics/devices/energy):
  store prose one/two plain-text paragraphs; simplified transparent text-free
  widget previews; broad API permission needs core-function justification and
  extra review, with branded-device restrictions; cumulative meters must not
  decrease. Pinned verified validation is not Athom approval.

Community mappings may corroborate fields but are not vendor contracts.
Existing MIT attribution remains intact; no third-party implementation copied.

## Measurements, validation and coverage limits

Node **22.23.4**, macOS ARM64, committed lockfile, Homey CLI **4.5.3**.
`npm ci`, complete `npm test` (**1,488/1,488**), lint, release:check,
`npm audit` (**0 vulnerabilities**) and whitespace checks passed locally.
Prepared Playwright Chromium; isolated public export passed Homey
`app validate --level verified` with the API-permission warning preserved.
The corrected final runtime was rerun through these checks; exact results,
reviewer returns and source-sync identity are in the external receipt.

All four readiness commands were actually run. `release:full`,
`release:monitoring`, `release:acceptance` and `release:dual-ct` each exited **1**
for pending hardware gates; these are blockers, not waived/green checks.
Full-release engineering acceptance in the ledger is not proof that U1/U2 have
been resolved. No acceptance entry was edited.

Actual optional coalesced-queue benchmark: one held consumer, 100,000 fixed-shape
submissions, one warm-up and five trials. Baseline median enqueue **2.204166 ms**
(range 1.847167-3.73125); final exact measurements are in benchmark-final.json.
Every trial keeps one pending batch, coalesces 99,999 and applies exactly two
batches ending at sequence 100,000. Stopped queue accepts no new work. This
policy already existed: **no measured optimisation gain claimed**. The different
unbounded Developer queue is documented in U2. These Mac synthetic measurements
are not Homey hardware, end-to-end MQTT latency or peak-memory guarantees.

The metadata-only diagnostic formatter also removes redundant parsing/redaction
work. Five alternating-order trials after warm-up, 10,000 calls each on one
1,075-byte synthetic malformed frame: baseline median **149.631709 ms**, final
**71.195083 ms** (52.42% lower). Size/digest/command metadata match; raw sample
removal is intentional. This formatter is unchanged by the later review
corrections. The measurement is not a parsed-telemetry or whole-app speed claim.

Coverage includes source and synthetic tests across original/5000 roles,
meter/Dual CT, solar/micro/socket, lifecycle/reconciliation, pairing/settings,
Flows/widgets/support, manifests and release workflows. It is not exhaustive
proof of all model/region/firmware combinations, every translated string or
native phone rendering. No new hardware/native capture is authorised.

Reviewed evidence: AGENTS/LOCAL_AI_WORKFLOW; current handover/newest STATUS;
combined-counter validation review/result and sanitised installation/candidate
receipts; solar/startup counter reports; 5000 monitoring RC/current API scope,
both acceptance JSONs; Dual CT Energy/qualification/three-phase documents and
release checklists/model coverage. Exact partial ranges, history omissions and
unresolved coverage are in external COVERAGE.md.

Private history was **not** loaded into hosted models. Only deterministic
historical index/manifest filename/date metadata was inspected: date tokens in
Aug-Oct and supplementary Oct 28/31 are not assured semantic coverage bounds.
Owner-correction/export-omission semantic review and original attachments remain
unavailable without an approved trusted-local inspector. No claim that the full
conversation transferred. Patrick, Robert, Stefan and Ed remain distinct people.
Current canonical owner corrections outrank historical assistant assumptions.

## Sync, handover and next bounded sprint

Only explicit inspected source/tests/copy/reports plus the inherited three
installation documents are intended for normal diagnostic-branch commit/push.
Final exact commit IDs, runtime/diff hashes, CI URLs/results, model final returns,
package inventory, residual Git status, temporary exports and lease/index
outcome belong to:
`../work/output/full-release-review-2026-11-06/FINAL_RECEIPT.md`.
That receipt is outside Git to avoid a recursive handover/CI commit loop.
Source CI does not establish a store change or deployment.

Next bounded sprint: define/reproduce native-counter ordering and confirmed-reset
semantics, then a loss/overload policy for the Developer queue preserving raw
counter/receipt provenance; add per-field legacy power expiry with failure and
recovery tests. Keep all source identity/history boundaries and existing features.
Owner decisions: store API-permission/core-scope policy and separate exact-artifact
validation authority. Physical scope/native comparisons, preservation, phone
rendering and 48-hour soak must use specifically approved exact runtime evidence,
not reviewer consensus or this task's historical installation approval.

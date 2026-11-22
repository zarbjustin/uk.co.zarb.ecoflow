# STREAM Solar startup continuity - 6 November 2026

## Outcome and authority

Source-only repair of the reproduced cumulative-generation rollback. Baseline
branch was `codex/mixed-generation-reporting-diagnostics`, HEAD
`169495793b8932dc6565db546ccd008081032ae6`, fetched with local/remote 0/0.
The installed observation was a 4 Wh startup decrease; later generation did not
repair that acceptance failure. The historical physical store/flush sequence
was not traced, and no failed write or interrupted checkpoint is claimed as its
proven cause.

No installation, publication, restart, hardware/API/UI read, settings/Flow/Energy
change, counter rewrite, battery operation or tester contact occurred in this
repair. Installed Development remains the previously delivered archive
`73c6aa47496d745a2081af53ae19db442d5f8bc1fc4ca2a65503ac809b9d9df4`
(version 1.11.20; delivery receipt, not independent installed-file rehash).
Homey reserve execution remains disabled at both switches; EcoFlow AI retains
reserve ownership. Historical fault/state/history, completed native lease, app
gate, resident runner and native reserves/tasks remain untouched.
Mainline, Test and Live were not changed.

## Confirmed defects and evidence

Line references here identify the immutable baseline unless stated otherwise.

| Severity / confidence | Trigger and impact | Root cause / repair |
|---|---|---|
| High / 10/10 | Stored 123000 Wh replaces an existing 123.004 kWh capability with 123 kWh: 4 Wh rollback. | `drivers/stream_solar/device.ts:32-34` unconditionally projected the scalar. Recover the genuinely newer same-source floor and checkpoint it without waiting for generation. |
| High / 10/10 | Negative, nonfinite or string stores reset, poison or concatenate the accumulator. | `device.ts:32-34,54-58` used a cast/truthiness fallback. Validate totals/conversion; preserve unsupported or unrecoverable history without restarting it at zero. |
| Medium / 10/10 | Same-instance restart integrates stopped time. | `device.ts:17,25-38,50-54,64-66` retained the anchor. Reset it on startup/teardown; first accepted sample anchors only. |
| Medium / 10/10 | SDK/queue latency changes observed integration intervals. | `device.ts:45-53` timestamped after an SDK await despite Base receipt metadata. Integrate accepted receipt times; reject duplicate/out-of-order/invalid/future receipts and excessive gaps. |
| Medium / 10/10 | Changed reporter or stale-source sample can add another source to existing history. | `device.ts:21-22,41-58` ignored sample source. Bind accounting to paired identity; mismatches pause/re-anchor, never relabel or merge histories. |
| Medium / 10/10 | Pending startup/attribution SDK work can outlive teardown, or maintenance can accumulate. | `device.ts:35-38,64-66,71-92` had unowned asynchronous continuations. Serialize startup and coalesced maintenance with Base's existing drain, and recheck lifecycle/source after discovery. |
| Medium / 10/10 | Failed final persistence leaves a retired retry owner. | `lib/EnergyCheckpoint.ts:32-52` always scheduled retry. Optional `close()` drains writes, cancels retired timers and retains dirty failure state for explicit retry before replacement. Existing callers retain their normal retry behavior. |

The solar file last changed at `350d27ef08c9f8d7dc0cc8b3770c0946433661ab`
(13 July 2026), before the recent sprints. This does not establish when the
physical checkpoint lag arose or assign the observation to those sprints.

## Restoration and ownership policy

- Legacy scalar and capability adoption is restricted to the immutable paired
  `data.sn`, with a matching read source. It preserves that device's history; it
  is not independent proof of physical topology or a successful pairing lookup.
- A coherent `solarEnergyState` v1 stores source and precise Wh together in one
  store value. Once present it supersedes the unbound `generatedWh` compatibility
  mirror. The mirror is written second; a failed mirror cannot override the
  coherent record on a fresh instance.
- A known-source corrupt v1 can recover a valid projected total, not a stale
  legacy mirror. Unknown version/source, structured future legacy data,
  unrepresentable conversion or unrecoverable invalid history is preserved with
  accounting paused. Retried persistence rechecks format/source ownership.
- A genuinely new device with absent history does not publish a startup zero.
  Its first measured sample starts the locally observed counter at zero without
  backfill. This differs from corruption of an existing history.
- Fractional Wh remain precise. A checkpoint of 123000.6 Wh is not rounded up
  merely because its native one-Wh display is 123.001 kWh. Conversely 123000 Wh
  versus 123.004 kWh recovers the newer floor. Projection does not decrease.
- Receipt time anchors integration before SDK awaits. An actual backward wall
  clock clears a future anchor; ordinary old receipts remain rejected.
  Accepted work drains before shutdown, including already-started SDK writes;
  no timeout pretends to cancel a write that can still finish.

No shared Base, identity/capability definition, custom title, Flow/Insights
reference, Energy registration, setting contract, version or acceptance ledger
was changed. Existing solar PV-capability migration is unchanged, not expanded.

## Actual independent reviews and resolution

The coordinator uses hosted Copilot `gpt-6.1-sol`. Three separate read-only agents
received the same immutable public baseline and requirements, then the same
frozen final snapshots. Their first passes completed before cross-review.
One coordinator edited the canonical checkout under its shared lease.

| Runtime-reported model | Final v2 outcome |
|---|---|
| `gpt-6-sol` | Approved; no remaining blocking findings. |
| `gpt-6-astra` | Approved; no remaining blocking findings; source/test hashes matched. |
| `mai-code-2` | Approved; no remaining blocking findings; source/test hashes matched. |

These are remotely hosted review contexts, not local inference. Upstream
provider endpoints and the exact MAI-Code-2.x1 Preview mapping are unattested;
`mai-code-2` is the actual reported model, not an asserted Preview identity.

Sol found a v1 candidate bug: after recovering a corrupt record, a successful
coherent write followed by failed mirror write could let the stale mirror restore
900 kWh on a fresh instance. Astra found a candidate regression: clock rollback
froze live power at 600 W instead of accepting 1200 W. MAI's v1 review found no
blocker and requested first-key persistence-failure coverage. Real compiled
regressions reproduced both blockers; coherent-record precedence and clock
re-anchoring resolved them. An additional regression reproduced old retry
overwriting a newly unsupported format. Ownership checking now prevents it.
Both store-key failure cases are covered. Resolution used source and execution,
not majority voting; all three then approved the identical v2.

## Reproduction and checks

External evidence root:
`../work/output/copilot-solar-continuity-2026-11-06/`.

- `primary-before-fix.log`: original compiled real driver failed
  `123 !== 123.004`, with synthetic Homey/discovery/transports only.
- `review-before-corrections.log`: candidate failures `900 !== 123.004`,
  `600 !== 1200`, and incorrect old-retry handling of future state.
- `targeted-tests.log`: 22/22 solar/checkpoint tests passed after correction.
- `npm-ci.log`: committed-lockfile install passed under Node 22.23.4.
- `npm-test.log`: full `npm test` passed, 1,456/1,456 tests (1,437 baseline).
- `lint.log`, `release-check.log`: repository lint and release checks passed.
- `git diff --check`: passed; explicit staged diff is checked again before commit.
- `homey-validate.log`: pinned Homey CLI 4.5.3 verified validation passed in the
  isolated `solar-validation` directory under the session files path. Playwright
  Chromium preparation passed. The existing manager API permission warning
  remains a store-review warning, not a validation failure.

The raw ESLint executable encountered the existing minimatch adapter issue;
the documented `npm run lint` wrapper passed without weakening rules.
Additional local `npm audit` attempts were infrastructure failures: configured
proxy HTTP 400, public-registry ENOTCONN. No manifest/lock/config was rewritten
to hide them. Local standalone audit is **not verified**; the unchanged audit
step passed in the exact-source GitHub Actions run below.

Final source/test SHA256:

| File | SHA256 |
|---|---|
| `drivers/stream_solar/device.ts` | `14faccdfd2417c5da2cdb053ac06b9108f6f5426885f0002572dfeb1e66d793f` |
| `lib/EnergyCheckpoint.ts` | `3a7465d36a678527cc15e063e0eda5f6a0437e1c679674a29453509e73dcc42a` |
| `test/energyCheckpoint.test.js` | `90022e2c781abac63607af636a4e01b7a25c861f4d66b850080e025e1ab32af1` |
| `test/solarEnergyLifecycle.test.js` | `31d506b9b4336599c96242d0fbf23579c96aa631fcad88d90a572852e1614be2` |

Changed runtime fingerprint:
`04d813de28ce35e4401c41ca174efe38d5ab6cf571e8e7560343e1dda525307f`.
This is source validation, not an installed hash or hardware acceptance.

## Coverage, inherited work and gaps

Reviewed current source/helpers/Base queue and teardown, pairing source policy,
counter policies, package/CI scripts, AGENTS/workflow, new handover/status
checkpoints and all three inherited Sprint 5 installation/AI-owner documents.
Reviewed STREAM 5000/Dual CT acceptance records and relevant RC boundaries;
their old runtime observations are not current acceptance.
The sanitized installation manifest, initial difference, continuity review,
final receipt and synthetic replay were read. They cover the 6 November
10:17-10:22 UTC observation and source failure mode, not the underlying physical
store sequence.

Private transcripts, original images, raw household captures, credentials and
the installation `private/` directory were not loaded into these hosted models.
The private historical package's full semantic coverage, owner-correction
supplement and export omissions were not freshly inspected by a trusted local
model in this task. That historical coverage gap remains explicit; neither
package is claimed to contain all conversation through today.

Baseline dirty work belonged to the prior owner-authorised continuation:
CODEX_HANDOVER/STATUS additions plus the three Sprint 5 documents named above.
Those corrections are deliberately retained and integrated with this handover,
not attributed to new live actions. A backup of the inherited tracked diff is
outside Git. New work is the four source/test files and this report/checkpoint.
No private evidence or generated package is staged.

## Open gates and bounded next work

Installation, upgrade-counter continuity, icon rendering/provenance, independent
native comparison and normal-use soak remain open. ES21/ES22 and Dual CT
runtime-specific gates remain pending; neither acceptance JSON was changed.
Hardware `--require-ready` commands and live experiments were **not run**.
Software tests/CI cannot repair the installed archive or accept the startup dip.

Separately approve one target-specific non-clean validation update only after
fresh ownership/quiescence and full preservation baseline. Keep both Homey
execution switches disabled and native EcoFlow AI in charge. Review exact new
archive provenance separately; compare immediate pre/post solar cumulative
readback before generation masks a decrease, all other counters and preserved
definitions. No automatic rollback, counter rewrite, control or soak start.

Next source sprint: independently reproduce `stream_micro`'s analogous scalar
startup/restart path and investigate battery startup projection floors with
raw-counter consistency. These are review leads, not accepted hardware defects
or permission for a blind shared max-total change.

## Source synchronization receipt

Reviewed source commit:
`8f1ba3360615ad56f2e7b86cd83e5f251ce2568f`, normally pushed to the diagnostic
branch after a fresh fetch confirmed one ahead/zero behind.
[Exact-source CI 42220029950](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/42220029950)
completed **successfully**. Every job step passed, including npm ci, Chromium,
tests, lint, release checks, audit and pinned verified validation. Public run/job
JSON is preserved in external `source-ci-run.json` / `source-ci-jobs.json`.

The final documentation-only commit deliberately includes the five inherited
owner-continuity files plus this report. Its SHA/CI, final tree/lease/index state
and exact local paths belong in external `FINAL_RECEIPT.md` to avoid a
receipt-commit loop. Source/CI success does not update the installed archive or
close physical acceptance.

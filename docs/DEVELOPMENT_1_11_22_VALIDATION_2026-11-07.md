# Development 1.11.22 installation and validation — 7 November 2026

## Outcome

**Installed once non-clean on Justin's Homey Pro. Preservation PASSED; runtime
validation REQUIRES REVIEW.** Dual CT Energy was live before delivery, but now
says reconnecting with unknown live power. Both cumulative counters are intact.
This is not a fully working candidate or full-release acceptance. No automatic
rollback, second installation, pairing, restart or battery/settings fix occurred.

Owner explicitly approved this target/candidate. Source is
`c1c7f689a293b93c36fafba38115d8f720308da6`, diagnostic branch; exact
[CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/42376675594).
Archive SHA-256:
`5cb748296ca338f41353eddc03aef0d05af9081b2d6f6dd20db5d739d4b1cc7a`.
Runtime-source fingerprint:
`96c4c830907d7d3e8b3c72886d78da52b714e8f76c62590ef404f301f159f147`.
Acknowledgement: 2026-11-07T13:33:02.754Z, clean=false/debug=false. Two full readbacks report
1.11.22/running/devkit_install and geolocation only; broad API access is absent.
This is exact artifact delivery provenance, not independent installed-file hashing.

## Preflight and recovery limits

Fresh fetch found clean source/remote equal at c1c7f68. The first preflight held
on a pending original-system checkpoint with zero failures. Bounded read-only
observation found natural quiescence; a fresh complete preflight and immediate
pre-install safety check then passed. Failed/held receipts remain unmodified.
No checkpoint was forced, reserve released or fault cleared.

Fresh private baseline: 15 EcoFlow devices, 101 Flows, 1,217 Insights identities,
ten numeric cumulative counters, definitions/settings/capability options/custom
titles/Energy and global setting hashes. Both reserve execution switches disabled;
reviewed historical fault unchanged; no intent, stopping or active run lock;
completed fault-free reserve lease; resident runner hash/competing-writer scan
matched reviewed state. Fresh native configuration retained intelligent_plus and
empty tasks. No Homey reserve execution was resumed.

Separate owner-side full-Homey role review found only the existing Dual CT
included as a property meter. Office EcoFlow meter and detected external cumulative
meter were excluded; no roles were changed. Rechecked immediately before delivery.
This does not claim the installed app can automatically inspect external meters.

Prior 1.11.21 archive exists and matches
`fa7fd6a9a5b50488f919d072238db85327f7da2bc1843a1edf83d4fdf043f515`.
No counter/checkpoint schema or binding code changed in this update. This does
not prove a safe downgrade or complete Homey restore. The prior artifact restores
broad API permission/old advanced features. No private-store export, USB/cloud
backup operation or independent complete restore occurred. Rollback is not
automatic and needs separate review/approval.

## Preservation

Observer 2026-11-07T13:32:50.541Z–2026-11-07T13:34:51.506Z spans delivery:
103 cached inventory samples, minimum1second interval, zero numeric
counter decreases against baseline/last numeric observation, zero read errors or
throttling. Seven transient unknown samples occurred during startup; all ten
counters returned numeric. This is not two full minutes after acknowledgement
and cannot exclude shorter unobserved events or certify physical accuracy.

Full readbacks 2026-11-07T13:35:01.274Z and 2026-11-07T13:35:39.230Z preserve:

- All15 EcoFlow identities and all household device IDs.
- Settings, capability IDs/options/custom titles, notes/zones and Energy definitions.
- All101 complete Flows, no new broken Flow, and1,217 Insights log identities.
- Global setting hashes, execution config/state, native lease and app gate.
- All ten comparable cumulative totals, without decreases or new unknown totals.
- Native configuration values, fresh AI mode/empty tasks and disabled Homey execution.

Fourteen devices have regenerated capability icon URLs; definitions otherwise
match. Phone rendering was not rechecked. No independent private-store/checkpoint
checksum is exposed by these API readbacks.

## Runtime validation issue

Dual CT Energy was available with numeric power immediately before installation.
It is unavailable with unknown power in both complete readbacks. A focused
13:37:26UTC follow-up, over four minutes after acknowledgement, still showed
reconnecting and two numeric cumulative counters. Homey Energy currently lacks
this device's live grid watts; missing power must not be treated as zero.

This is a confirmed before/after regression observation, **not an established
root cause**. SDK-owned inventory/override/exclusion semantics and source/recovery
admission are priority hypotheses. Local existing devkit stdout was read without
creating/uploading a cloud crash report; fixed-classification projection found
no specific reader exception. Existing single-phase diagnostics do not expose the
same startup-stage evidence as the three-phase community export. No raw stdout
was loaded into hosted context. Do not loosen completeness/freshness guards or
re-pair to hide the failure.

Microinverter was already unavailable before installation and remains so; its
identity/history/counter are preserved. STREAM5000 SOC/system readings returned;
one linked physical unit remains scope-unverified. Native configuration agreement
is not a native power/model/energy-accuracy acceptance comparison. No physical
gate closed, no acceptance ledger changed and no48-hour soak started. Full release
remains NO-GO. Single-phase/ES21 cannot qualify three-phase/ES22.

## Boundaries and next step

Authenticated store reads before/after retain Test1.11.21/build88 and Live1.10.3/
build18. Mainline untouched. No battery reserves/limits/modes/tasks, settings,
Energy inclusion, Flow execution, pairing/Repair, forced reconnect/silence,
publication or external contact. Only the approved installation restarted app
readings. EcoFlow AI remains in charge; both Homey execution switches stay off.

Next: investigate owned-inventory and source-admission paths using existing
receipts. If new diagnostics are needed, prepare a source-only patch/regression
tests and exact candidate for review. No further installation or rollback under
this approval. Keep counters, real stale warnings, Test/Live and battery settings.

Private receipt: ../work/output/development-1.11.22-20261107T1331Z/FINAL_RECEIPT.md.
Private originals/credentials/stdout remain local outside Git; only sanitized
projections entered Codex remote-model context. No new production source edit or
full test rerun; exact CI and1,520-test/package checks remain source evidence.
Helper syntax and documentation whitespace were checked separately.

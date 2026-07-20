# Pre-Submission Checklist — EcoFlow STREAM Series

Run before submitting a new build for App Store certification.

## Quality gates (all must pass)
- [ ] `npm run build` — TypeScript compiles.
- [ ] `npm test` — all unit tests pass (currently 48).
- [ ] `npm run lint` — clean.
- [ ] `npx homey app validate --level publish` — validates clean.
- [ ] `npm run widgets:preview` — previews regenerated if any widget HTML changed, and each
      `preview-light.png` / `preview-dark.png` visually matches its widget.

## Certification items
- [ ] All **5 widgets** present with **distinct** previews (fixes the "identical previews" note).
- [ ] No permanently-empty capabilities/tiles (BK41 PV count fixed; history tiles on-demand).
- [ ] `energy_consumption_today` labelled experimental (unreliable data not shown as authoritative).
- [ ] Energy metadata intact: `stream` homeBattery + charged/discharged; `smartmeter` cumulative
      import/export; solar exported production.
- [ ] `docs/REVIEWER_NOTES.md` (incl. widgets section) and `docs/CERTIFICATION_REPLY.md` ready to
      paste; demo credentials filled in on the dashboard **only** (never committed).

## Release (user-owned)
- [ ] Commit & push to `master`.
- [ ] Run *Update Homey App Version* workflow (minor → **v1.9.0**) with the changelog from
      `docs/STATUS.md`.
- [ ] Run *Publish Homey App* workflow to create the build.
- [ ] `git pull` to sync the version-bump commit/tag.
- [ ] Submit the build for certification and paste the reviewer notes/reply.

## Hardware-gated follow-ups (post-release, verify on a live unit)
- [ ] STREAM Max (BK41) PV-input count (set to 2 — confirm).
- [ ] `self_heating` field name (prune candidate list once known).
- [ ] Per-socket `powGetSchuko1/2` for `stream_socket`.
- [ ] Reserve/discharge 8524-safe sequence and new tariff Flows on the live STREAM.

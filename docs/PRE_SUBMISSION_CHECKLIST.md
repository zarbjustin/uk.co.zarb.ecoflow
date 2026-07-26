# Pre-Submission Checklist — EcoFlow STREAM Series (v1.8.6 review)

Run before submitting a new build for App Store certification.

## Quality gates (all must pass)
- [ ] `npm run build` — TypeScript compiles.
- [ ] `npm test` — all unit tests pass (currently 51).
- [ ] `npm run lint` — clean.
- [ ] `npx homey app validate --level publish` — validates clean.
- [ ] `npm run widgets:preview` — regenerate previews from the dedicated vector artwork.
- [ ] Every `preview-light.png` / `preview-dark.png` is 1024x1024 PNG with alpha transparency,
      contains no text or screenshot content, uses simple shapes, and differs from the others.

## Certification items
- [ ] All **5 widgets** have **distinct, Homey-compliant** preview pairs.
- [ ] Widget content is accurate: Energy Flow arrow direction correct; "Solar Target" and "Energy
      Recommendation" named for what they actually do; consumption/independence marked estimated.
- [ ] No permanently-empty capabilities/tiles (BK41 PV count fixed; history tiles on-demand).
- [ ] `energy_consumption_today` labelled "(est.)" (unreliable data not shown as authoritative).
- [ ] Energy metadata intact and **trustworthy** (H2/H3 fixed): meters stay monotonic across
      restarts; no cross-mode double-count.
- [ ] `docs/REVIEWER_NOTES.md` (incl. widgets section) and `docs/CERTIFICATION_REPLY.md` ready to
      paste; demo credentials filled in on the dashboard **only** (never committed).

## Release (user-owned)
- [ ] Merge PR `copilot/review-v1.8.6` to `master`.
- [ ] Run *Update Homey App Version* (minor → **v1.9.0**) with the changelog from `docs/STATUS.md`.
- [ ] Run *Publish Homey App* to create the build; `git pull` to sync the version-bump commit/tag.
- [ ] Submit the build and paste the reviewer notes/reply.

## Hardware-gated follow-ups (post-release)
- [ ] STREAM Max (BK41) PV-input count (set to 2 — confirm).
- [ ] `self_heating` field name.
- [ ] Per-socket `powGetSchuko1/2` for `stream_socket`.
- [ ] 8524-safe reserve sequence, `Release battery for export now`, and grid threshold triggers on
      a live STREAM.

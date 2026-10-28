# EcoFlow STREAM repository instructions

## Resume here

Read `docs/CODEX_HANDOVER.md`, then the newest checkpoint in `docs/STATUS.md`.
Read `docs/STREAM_5000_MONITORING_RC.md` and its JSON acceptance ledger before
making a release or hardware-acceptance claim. Older sprint documents and older
sections of STATUS are history, not current instructions or renewed approval.

The active work is on `codex/mixed-generation-reporting-diagnostics`, not the
repository's default `master`. Fetch the remote and check the branch/dirty state
before editing. Preserve unrelated work; never force-push or merge Mainline just
to make branch state match. A different Codex instance must not assume old chat
approvals authorise a new installation, publication or physical test.

## Safety boundaries

- Keep Mainline, store Test and Live unchanged unless the owner specifically
  authorises that action. Source push, CI, store channel, installation and
  physical behaviour are separate checkpoints.
- Homey/API/hardware investigation defaults to read-only. No battery task,
  setting, outlet, Flow execution, re-pair, clean install, restart or forced
  silence/reconnect without specific owner approval. Non-clean installation
  also needs approval and a private preservation baseline/readback.
- STREAM 5000 physical monitoring is separate from default-off aggregate Energy
  pairing. Do not activate new controls, Energy, mixed-generation auto-merging,
  Dual CT accounting or the disabled passive timer observer as a shortcut.
- Hardware passes are exact-runtime/model/role-specific. Keep missing readings
  unknown, distinguish live from last-reported standby, and never treat fresh
  temperature as fresh battery power. Software replay is not hardware signoff.
- Preserve paired identities, capabilities/custom titles, settings, saved Flows,
  Insights identities and counter continuity. Null daily-history values do not
  authorise deleting an existing capability.
- This GitHub repository is public. Never commit credentials, account sessions,
  env.json, raw household diagnostics/screenshots, full device IDs/serials or
  private support correspondence. Keep only sanitised findings and synthetic
  fixtures. Do not paste secrets into chat or logs.
- Draft external replies for review. Sending/posting requires explicit approval;
  reopen the sent/permanent item to verify. Do not request more repeated captures
  from community testers without a clear new need and owner approval.

## Checks

Use the committed lockfile (`npm ci`), Node 22 as in CI, and the pinned Homey CLI
4.5.3 for comparable verified validation. Run `npm test`, `npm run lint`,
`npm run release:check` and `git diff --check`. Prepare Playwright Chromium as in
CI when required. Hardware readiness commands deliberately fail while gates
remain open; do not weaken their checks to obtain a green release.

For changes, update the current repository handover/status without copying raw
evidence. Keep handover useful without this machine's Codex memory or REPL state.

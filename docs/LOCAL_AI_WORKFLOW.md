# Shared local AI workflow — EcoFlow

Owner-authorised local integration configured on 31 October 2026.

## Canonical checkout

`/Volumes/WD_BLACK SN850X 800GB/Codex/2026-10-28/take-over-development-of-my-ecoflow/uk.co.zarb.ecoflow`

Both Codex and AnythingLLM use these actual working-tree files. The older
`AnythingLLM/coding-lab/repositories` copies are evaluation snapshots only.
Do not copy their contents back over this checkout. Keep existing local work;
never reset, force-push, auto-stash or discard changes to make it look clean.
Current branch/HEAD must be read fresh. Start with `docs/CODEX_HANDOVER.md` and
the existing repository instructions. Older release/install observations remain
dated evidence, not current authority or proof of device acceptance.

## Turn-taking and edits

AnythingLLM workspace: **Homey · EcoFlow** (`homey-ecoflow`).
Use `@agent` and the **Homey Shared Repository** tool. Read/status/search are live.
Before writing, acquire this project's editing lease. The tool requires a fresh
file SHA256 and repository HEAD, displays old/new content, and forces an interactive
approval for each write. Rejection stops writes for that agent session. No shell,
Git writes, Homey control, deletion or rename operation is provided.

Codex must use the same lease before editing. The local helper is:

```sh
python3 '/Volumes/WD_BLACK SN850X 800GB/AnythingLLM/integration/shared_homey.py' status ecoflow
python3 '/Volumes/WD_BLACK SN850X 800GB/AnythingLLM/integration/shared_homey.py' acquire ecoflow --owner codex:YOUR_CHAT
# Inspect fresh source/diffs, make only the requested change and run appropriate offline checks.
python3 '/Volumes/WD_BLACK SN850X 800GB/AnythingLLM/integration/shared_homey.py' finish ecoflow --owner codex:YOUR_CHAT
```

Never edit while the lease belongs to another writer. Ask that writer to finish
and release it. Leases do not expire or transfer automatically. This is a cooperative
protocol: editors outside it can bypass the lease. The AnythingLLM writer additionally
rechecks file hashes, but a single agreed writer remains required.

## Knowledge and handover

Update the canonical handover, decisions/learnings and relevant backlog in the
same bounded task as the implementation. Record exact files, changes, checks actually
run, remaining work and open acceptance gates. Do not write raw credentials, household
diagnostics, private support material or complete chat logs into Git or this index.
Chat histories and hidden/model memory do not automatically transfer between apps.

The project workspace indexes approved tracked Markdown/text documentation with source
paths and content hashes. It refreshes before helper queries, after Codex `finish`,
and through the existing 30-minute documentation heartbeat while the Mac/app are available.
For AnythingLLM work, release the lease and call refresh after editing handover/docs.
The source tool always reads live files; retrieval copies can lag between refreshes.

```sh
python3 '/Volumes/WD_BLACK SN850X 800GB/AnythingLLM/integration/shared_homey.py' query ecoflow 'your question'
python3 '/Volumes/WD_BLACK SN850X 800GB/AnythingLLM/integration/refresh_shared_projects.py' --project ecoflow
```

The local registry and tool policy live under `AnythingLLM/integration` on the external
disk. Secrets, ignored files, private evidence, backups, dependencies and generated
builds are excluded. Some source names containing secret/token terms are conservatively
excluded; use Codex privately if one is needed. Keep repository content on the local
model/provider. Do not forward it to web, email or cloud/image tools.

## Authority and validation

Local source editing does not authorise publishing, pushing, installation/restarts,
changing Homey settings/Flows, controlling hardware or sending external messages.
When generic historical release checklists say to install/publish, this integration's
current scope still stops before those actions. Keep source/test, CI, release channel,
installed version, telemetry and physical acceptance separate. AnythingLLM has no test
runner; mark tests NOT RUN until Codex runs the appropriate offline checks. Never
weaken acceptance gates to obtain a green result.

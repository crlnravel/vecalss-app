---
role: agent-instruction
scope: workflows
description: Execution flows and procedures
---

# Workflows

## Session start

Run this at the beginning of every new session or agent handoff.

1. Read `AGENTS.md` → follow harness routing.
2. Read `_harness/tracking/session-handoff.md` for context from the previous session.
3. Read `_harness/tracking/feature_list.json` to see current feature state.
4. Read `_harness/tracking/progress.md` for in-progress work.
5. Run `./_harness/resource-guard.sh status` to inspect the shared CPU/process budget.
6. Run `./init.sh`; it serializes dependency installation, lint, and build through the resource guard. Do not bypass it with an unguarded `pnpm install && pnpm lint && pnpm build` chain.
7. If the guard returns exit `75`, do not retry in a loop; record the snapshot and continue only with read-only planning until capacity is available.
8. If the build fails, fix it before starting new work — the codebase must be green at session start.
9. Pick ONE unfinished feature or continue the active task. Do not work on multiple features simultaneously.

### Shared-worktree coordination

Before editing a file that may belong to another active agent, check the
orchestrator's ownership messages and notify that owner. Preserve unrelated
dirty changes; never use a reset, checkout, or broad revert to make the worktree
convenient. If overlap is unavoidable, keep the change scoped and record the
overlap in the handoff.

## Codebase exploration

Use **codegraph** before diving into unfamiliar code. It maps module relationships, call chains, and dependencies faster than manual file reading.

**When to use codegraph:**
- Starting a new feature in an unfamiliar area
- Tracing how a change propagates across modules
- Understanding domain boundaries and import relationships
- Investigating bug reports that span multiple layers
- Before a refactor to identify all affected consumers

**Flow:** codegraph exploration → `_harness/catalog.md` for directory context → read specific files

## Feature development

The default workflow for new features prioritizes UX validation before backend work.

### Steps

1. **UI + mock logic** — Build the UI with mock data to clarify the user flow. Present the flow to the user for agreement before proceeding. **Commit.**
2. **Schema change** — Update `prisma/schema.prisma` with the required model changes. **Commit.**
3. **Migration** — Create and commit a reviewed migration (see Prisma procedure below). **Commit** the migration with the schema change if not already committed together.
4. **Server logic** — Implement domain logic in `lib/`, services, Server Actions, and route handlers. **Commit each logical unit** (e.g., one service, one action).
5. **UI adjustment** — Wire real data into the UI, adjust based on actual API responses and edge cases. **Commit.**
6. **Test** — Run relevant `test:*` scripts through the resource guard and the guarded `pnpm verify`. **Commit** any test files or fixes.

### Commit rule

**Every step must be committed before starting the next.** Do not accumulate uncommitted changes across steps. See `_harness/rules.md` § Commit policy.

### Flow principle

```
UI prototype (mock) → user confirms flow → schema → migration → server logic → real UI → verify
```

The UX confirmation step is a hard gate. Do not proceed to schema/backend work until the user has agreed on the flow direction.

## Bug fix

1. Reproduce or understand the failure from the report.
2. Locate the affected code using `_harness/catalog.md` and `_harness/routing.md`.
3. Fix the root cause. Prefer fixes that prevent recurrence over patches.
4. Run the focused `test:*` script for the affected area through the resource guard.
5. Run `./_harness/resource-guard.sh run -- pnpm lint` and, if the fix is cross-cutting, `./_harness/resource-guard.sh run -- pnpm verify`.

## Prisma migration procedure

1. Edit `prisma/schema.prisma`.
2. Create the migration against a **local development database only**:
   ```bash
   ./_harness/resource-guard.sh run -- pnpm exec prisma migrate dev --name <descriptive-name>
   ```
3. Review the generated SQL in `prisma/migrations/`.
4. Regenerate the Prisma client:
   ```bash
   ./_harness/resource-guard.sh run -- pnpm db:generate
   ```
5. Verify migration status:
   ```bash
   ./_harness/resource-guard.sh run -- pnpm exec prisma migrate status
   ```
6. For deployment, use:
   ```bash
   ./_harness/resource-guard.sh run -- pnpm exec prisma migrate deploy
   ```
   Never use `prisma db push` for deployment.

### Migration rules

- Never rewrite or delete existing migration files.
- Always create forward migrations.
- Destructive migrations (dropping columns/tables with data) require explicit user confirmation.

## Design token changes

1. Edit the source in `design-tokens/palette.mjs`.
2. Regenerate:
   ```bash
   ./_harness/resource-guard.sh run -- pnpm tokens
   ```
3. Include the regenerated `app/generated-theme.css` in the commit.
4. Never edit `app/generated-theme.css` directly.

## Verification

### During iteration

```bash
./_harness/resource-guard.sh run -- pnpm lint
```

### Focused domain checks

Run the relevant named test script for the area changed:

```bash
./_harness/resource-guard.sh run -- pnpm test:<area-name>
```

There is no repository-wide `pnpm test` command. Choose the narrowest named
script that exercises the changed contract; database-backed checks require the
appropriate local database and environment variables.

For import-worker changes, also run:

```bash
./_harness/resource-guard.sh run -- pnpm admin:imports-worker:check
```

### Browser verification gate

Before performing any verification using a browser (**ego-browser**):
1. **Request explicit user permission first.** Never run browser verification autonomously.
2. The permission request MUST specify:
   - **Target route(s):** Exact URL path(s) to check (e.g. `/mentor/tryouts/new`, `/dashboard`).
   - **Role / persona:** The user role or session state to test with (e.g. Kapten / tutor, Voyager / student, Admin).
   - **Verification items:** The concrete list of UI elements, responsive views (e.g. desktop/mobile), forms, or user flows to verify.
3. Wait for the user's explicit confirmation before launching the browser.

### Before declaring completion

```bash
./_harness/resource-guard.sh run -- pnpm verify    # lint + production build
```

### Completion checklist

- [ ] `pnpm lint` passes through `_harness/resource-guard.sh`
- [ ] Relevant `test:*` scripts pass (report which ones were run)
- [ ] `pnpm verify` passes through `_harness/resource-guard.sh` (for integration-ready or release-relevant work)
- [ ] Browser verification performed only after explicit user confirmation (specifying route(s), role, and verification items)
- [ ] Report exactly which commands ran and whether they passed
- [ ] Do not claim success when required checks fail
- [ ] Clearly document genuine environment blockers, skipped checks, and remaining risk

### Destructive commands (always require confirmation)

| Command | Effect |
|---|---|
| `pnpm db:reset` | Erases all local database data |
| `pnpm db:seed` | Resets database and reseeds demo data |
| `pnpm db:apply-*` | Applies destructive guarded operations |
| `pnpm test:scalability` | Requires Docker; only for Redis/shared-rate-limit changes |

## Session end

Run this at the end of every task or before handing off to another session/agent.

### 1. Verify

- Run the completion checklist above.
- Run `./_harness/resource-guard.sh status` and stop any agent-owned
  long-lived dev server, watcher, or worker before handing off.
- Ensure all changes are committed (see `_harness/rules.md` § Commit policy).

### 2. Update tracking

- Update `_harness/tracking/progress.md` with what was done, what's in progress, and what's next.
- Update `_harness/tracking/feature_list.json` — mark completed features, update status and evidence.
- Fill in `_harness/tracking/session-handoff.md` with:
  - Current objective and branch/commit
  - What was completed
  - Verification evidence (commands run, results)
  - Files changed
  - Decisions made
  - Blockers/risks
  - Recommended next step

### 3. Update memory

- **Project memory** — Write only settled architecture and workflow decisions
  (plus development-emergent lessons that future agents must treat as project
  truth) to `_harness/memory/project.md`. Do not duplicate product specs,
  design docs, or commands already discoverable from the repository.
- **Agent local memory** — Use `_harness/memory/agents/<agent>.local.md` for
  active task context, assumptions, blockers, and next steps. Update it at
  handoff, then prune it after the task completes or when notes become stale.
- **GC** — Follow `_harness/gc/POLICY.md` for cleanup rules.

### 4. Commit tracking updates

Commit the tracking and memory file updates as a final micro-commit.

## Rollback and recovery

When things go wrong mid-task, follow these procedures instead of pushing forward with broken state.

### Build breaks

1. Stop. Do not continue implementing features on top of a broken build.
2. Run `./_harness/resource-guard.sh run -- pnpm lint` to isolate the issue.
3. If the error is in your recent changes, fix and commit.
4. If the error predates your changes, document it and surface to the user.

### Migration fails

1. If `prisma migrate dev` fails, read the error carefully — it usually points to a schema conflict or data issue.
2. Do **not** delete or edit existing migration files to fix the problem.
3. If the migration was partially applied, use `prisma migrate resolve` to mark it as rolled back, then create a corrected forward migration.
4. If unsure, surface the error to the user before proceeding.

### Wrong direction

1. If you realize the implementation approach is wrong mid-task, **stop and commit what you have** with a clear message like `wip: pausing — approach needs rethinking`.
2. Surface the issue to the user with what you tried and why it's not working.
3. Do not silently rewrite large amounts of code to switch approaches — that's a confirmation-required decision.

### Uncommitted mess

1. If you have many uncommitted changes across unrelated areas, stop and triage:
   - `git diff --stat` to see what's touched.
   - Stage and commit each logical unit separately.
   - Do not create a single "catch-all" commit.
2. If changes conflict with each other, surface to the user.

### Test failures

1. Read the failure output carefully. Distinguish between:
   - **Your bug** — fix it.
   - **Pre-existing failure** — document it, don't mask it.
   - **Environment issue** (missing DB, missing env var) — document the blocker.
2. Never modify a test solely to make it pass without understanding why it failed.

## Conflict resolution

When sources conflict:

| Conflict | Resolution |
|---|---|
| `DESIGN.md` vs. older product docs on visual styling | `DESIGN.md` and `design-tokens/palette.mjs` take precedence |
| Product specs vs. current code on behavior | Surface the conflict to the user; do not silently choose |
| Harness rules vs. user's explicit instruction | User's instruction takes precedence for that task |
| MVP Grand Plan vs. current codebase on implementation | Current codebase is the source of truth for what exists |

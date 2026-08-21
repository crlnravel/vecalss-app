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
5. Run `./init.sh` (or manually: `pnpm install && pnpm lint && pnpm build`) to verify the project compiles cleanly.
6. If the build fails, fix it before starting new work — the codebase must be green at session start.
7. Pick ONE unfinished feature or continue the active task. Do not work on multiple features simultaneously.

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
6. **Test** — Run relevant `test:*` scripts and `pnpm verify`. **Commit** any test files or fixes.

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
4. Run the focused `test:*` script for the affected area.
5. Run `pnpm lint` and, if the fix is cross-cutting, `pnpm verify`.

## Prisma migration procedure

1. Edit `prisma/schema.prisma`.
2. Create the migration against a **local development database only**:
   ```bash
   pnpm exec prisma migrate dev --name <descriptive-name>
   ```
3. Review the generated SQL in `prisma/migrations/`.
4. Regenerate the Prisma client:
   ```bash
   pnpm db:generate
   ```
5. Verify migration status:
   ```bash
   pnpm exec prisma migrate status
   ```
6. For deployment, use:
   ```bash
   pnpm exec prisma migrate deploy
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
   pnpm tokens
   ```
3. Include the regenerated `app/generated-theme.css` in the commit.
4. Never edit `app/generated-theme.css` directly.

## Verification

### During iteration

```bash
pnpm lint
```

### Focused domain checks

Run the relevant named test script for the area changed:

```bash
pnpm test:<area-name>
```

For import-worker changes, also run:

```bash
pnpm admin:imports-worker:check
```

### Before declaring completion

```bash
pnpm verify    # lint + production build
```

### Completion checklist

- [ ] `pnpm lint` passes
- [ ] Relevant `test:*` scripts pass (report which ones were run)
- [ ] `pnpm verify` passes (for integration-ready or release-relevant work)
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

- **Project memory** — Write any durable decisions, conventions, or lessons learned to `_harness/memory/project.md`. Only store development-emergent knowledge that cannot be reliably inferred from code or documentation.
- **Agent local memory** — Update `_harness/memory/agents/<agent>.local.md` with current working state, then prune completed or obsolete notes.
- **GC** — Follow `_harness/gc/POLICY.md` for cleanup rules.

### 4. Commit tracking updates

Commit the tracking and memory file updates as a final micro-commit.

## Rollback and recovery

When things go wrong mid-task, follow these procedures instead of pushing forward with broken state.

### Build breaks

1. Stop. Do not continue implementing features on top of a broken build.
2. Run `pnpm lint` to isolate the issue.
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

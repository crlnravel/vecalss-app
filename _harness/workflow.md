---
role: agent-instruction
scope: workflows
description: Execution flows and procedures
---

# Workflows

## Feature development

The default workflow for new features prioritizes UX validation before backend work.

### Steps

1. **UI + mock logic** — Build the UI with mock data to clarify the user flow. Present the flow to the user for agreement before proceeding.
2. **Schema change** — Update `prisma/schema.prisma` with the required model changes.
3. **Migration** — Create and commit a reviewed migration (see Prisma procedure below).
4. **Server logic** — Implement domain logic in `lib/`, services, Server Actions, and route handlers.
5. **UI adjustment** — Wire real data into the UI, adjust based on actual API responses and edge cases.
6. **Test** — Run relevant `test:*` scripts and `pnpm verify`.

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

## Memory update

At the end of every task:

1. **Project memory** — Write any durable decisions, conventions, or lessons learned to `_harness/memory/project.md`. Only store development-emergent knowledge that cannot be reliably inferred from code or documentation.
2. **Agent local memory** — Update `_harness/memory/agents/<agent>.local.md` with current working state, then prune completed or obsolete notes.
3. **GC** — Follow `_harness/gc/POLICY.md` for cleanup rules.

## Conflict resolution

When sources conflict:

| Conflict | Resolution |
|---|---|
| `DESIGN.md` vs. older product docs on visual styling | `DESIGN.md` and `design-tokens/palette.mjs` take precedence |
| Product specs vs. current code on behavior | Surface the conflict to the user; do not silently choose |
| Harness rules vs. user's explicit instruction | User's instruction takes precedence for that task |
| MVP Grand Plan vs. current codebase on implementation | Current codebase is the source of truth for what exists |

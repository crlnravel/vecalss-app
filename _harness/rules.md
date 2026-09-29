---
role: agent-instruction
scope: constraints
description: Constraints, boundaries, and evolution rules
---

# Rules

## Autonomy model

**Default: high autonomy.** Agents should execute without asking unless a confirmation gate applies.

## Multi-agent ownership

Parallel work is supported only when each active agent has a clearly separated
feature, ticket, or file boundary. The orchestrator's active roles and ownership
messages are authoritative; do not invent overlapping ownership or silently
take over another agent's files.

- Before editing a file that may be in another agent's scope, check ownership
  and message the owner.
- In a shared worktree, preserve unrelated dirty changes and do not rewrite,
  revert, or stage them without the owner's direction.
- Keep each commit limited to the logical unit owned by that agent; report any
  unavoidable overlap in the handoff.

## CPU and process safety

The reusable policy is extracted to
`.agents/skills/agent-resource-guard/SKILL.md`. This repository uses its
configured implementation at `_harness/resource-guard.sh`.

- Before a Node, package, test, build, worker, or other CPU-heavy command, run
  `_harness/resource-guard.sh status`; launch it only through
  `_harness/resource-guard.sh run -- <command>`.
- The guard checks load and matching processes, serializes launches across
  worktrees, lowers scheduling priority, and fails closed when blocked.
- Keep one active CPU-heavy command group, obey the configured per-turn and
  per-session launch budgets, and stop agent-owned long-lived processes before
  another guarded command.
- Do not bypass the guard with direct launches, background/watch/parallel modes,
  ad hoc process farms, broad process termination, or retry loops.
- **Emergency mode (2x more forgiving gates):** If the resource check blocks critical commands and high throughput is needed, an emergency mode (`--emergency` or `RESOURCE_GUARD_EMERGENCY=1`) relaxes gates to 2x base values. **Agents MUST NOT invoke emergency mode autonomously.** Explicit user permission is strictly required before using emergency mode.
- The resource check is separate from command confirmation and permission
  rules.

## Model and delegation policy

The default model for this project and all delegated workers is exact `gpt-6-luna` with reasoning effort `max`.

- Every subagent/delegated worker must be started with `gpt-6-luna` and `max` reasoning when the runtime exposes those controls.
- Any model other than exact `gpt-6-luna` requires explicit user permission before the agent is started or continued. This includes `gpt-6-sol`, the unsuffixed `gpt-6` alias, Terra, older models, and unverified model names.
- Never infer permission from a prior task, a default supplied by the runtime, or a model that appears capable enough. Ask in the current task and name the requested model.
- If the runtime cannot guarantee or report the selected model, fail closed: do not delegate until the user approves proceeding without verification.

### Branch-aware confirmation gates

- **Feature branches:** Full autonomy. Breaking changes are acceptable.
- **Main/staging branches:** Critical decisions require confirmation (see below).
- **"You can do anything" override:** When the user explicitly says this, all confirmation gates are suspended for the current task.

### What always requires confirmation

- Clarifying or changing user flows and product direction
- Destructive operations against live production environments (if any)
- Adding a runtime dependency or replacing a major library
- Changing established public routes or major user flows
- Introducing an unexpected architectural layer
- Cross-cutting refactors that substantially expand scope beyond the assigned task
- Performing browser verification or browser testing using ego-browser (must state routes, role, and verification checklist before launching)
- Activating resource guard emergency mode (`--emergency` or `RESOURCE_GUARD_EMERGENCY=1`)

### What does not require confirmation

- Creating new components, modules, or files
- Writing or updating tests
- Forward database migrations (`prisma migrate dev`, `pnpm db:generate`) for feature development
- Running `pnpm db:reset` and `pnpm db:seed` on local/development databases when evolving schemas
- Removing or deprecating legacy models, obsolete columns, and legacy compatibility layers
- Behavior-preserving refactors within the touched area
- Fixing lint errors, import ordering, formatting
- Reading specs and documentation
- Running `pnpm lint`, `pnpm verify`, or focused `test:*` scripts
- Minor UI adjustments following DESIGN.md

The resource guard remains mandatory for every process-starting command in this
list; the confirmation rule and the CPU/process rule are separate gates.

## Database & legacy policy (Pre-release phase)

The project is currently in an **active pre-release phase**. Agents must apply the following guidelines:

1. **Database migration is fully approved:**
   - Agents are expected and encouraged to migrate the database schema forward (`prisma migrate dev`, `pnpm db:generate`) whenever feature work or refactors require schema updates.
2. **No legacy preservation burden:**
   - Preserving legacy tables, obsolete schemas, deprecated columns, or historical backward-compatibility shims is **not important or required** at this stage.
   - Do not spend effort writing complex data quarantine rules, historical compatibility adapters, or fallback columns for legacy systems that are no longer part of the target product.
   - Move forward with clean, simplified schema models.
3. **No database backup requirement & disposable dev data:**
   - Creating manual database snapshots, dump files (e.g. `/tmp/*.dump`), or point-in-time backup archives before running migrations, tests, or resets is **not required**.
   - Data in local and development environments is treated as disposable fixture data that can be re-created via `pnpm db:seed`.
   - Agents are explicitly permitted to remove, truncate, delete, or reset existing data in the development database whenever they want or need to for test preparation or clean slates.
4. **Resets and reseeds are standard:**
   - When schema changes or migrations cause local state conflicts, or when tests require a pristine fixture slate, running `./_harness/resource-guard.sh run -- rtk pnpm db:reset` and `./_harness/resource-guard.sh run -- rtk pnpm db:seed` is a routine, accepted workflow.

### Environment & database topology

Detailed guide: [`docs/database-environments.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/docs/database-environments.md).

- **Local environment (`dev`):**
  - Uses Docker Compose (`docker-compose.dev.yml`) providing PostgreSQL 16 (port `55432`, database `vecalss_dev`) and Redis 7 (port `56379`).
  - Integration tests use the dedicated disposable database `vera_test` (port `55432`).
  - Fully ephemeral; resets and seeds (`pnpm db:reset`, `pnpm db:seed`) are standard.
- **Staging environment (`staging`):**
  - Uses **Neon** (Serverless PostgreSQL at `neon.tech`).
  - **Zero sensitive information / PII:** Staging data is non-sensitive and safe.
  - **Agent retrieval permitted:** AI agents are explicitly permitted to inspect, query, fetch, and read data from Neon staging (e.g., verifying schemas, inspecting test rows, troubleshooting).
  - **Disposable for now:** Staging is also disposable in this pre-release phase; no backups or legacy compatibility preservation required.
  - Deploy migrations using `prisma migrate deploy` (never `prisma db push`).
- **Production environment (`production`):**
  - **Not available yet.**
  - Fail closed: agents must never assume production exists or attempt queries/migrations against it.

## Protected areas

### Never touch without explicit permission

- Existing files in `prisma/migrations/` (do not rewrite or delete migration history)
- `.env` (production secrets)
- `DESIGN.md` (visual source of truth — propose changes, don't edit)
- `PRODUCT.md` (product context — propose changes, don't edit)

### Acceptable to touch

- `.env.local` (local testing)
- `.env.example` (documenting new variables)

### Never do

- Expose secrets, credentials, tokens, encryption keys, private URLs, or student data in client bundles, logs, fixtures, commits, or `NEXT_PUBLIC_*` variables
- Directly edit `generated/prisma/**` or `app/generated-theme.css` — edit sources and regenerate
- Weaken authentication, authorization, audit logging, data isolation, privacy, or domain invariants to simplify implementation or make a test pass
- Present local prototype state as successfully persisted data

## Stack constraints

### Architecture

- Default to Server Components and server-only data access
- Add `"use client"` only at the smallest boundary needing state, effects, event handlers, or browser APIs
- Keep database access, secrets, privileged operations, and business rules on the server
- Every protected page, Server Action, and route handler must enforce authorization through centralized session and role helpers — hiding UI controls is never sufficient
- Validate untrusted inputs at the server boundary, even when client-side validation exists
- Production mutations must use Server Actions or route handlers and return authoritative server state

### UI and design

- Follow `DESIGN.md` for all UI work. Reuse existing tokens, variants, components, and patterns.
- When older product documents conflict with `DESIGN.md` or `design-tokens/palette.mjs` on visual styling, the current design system takes precedence
- Use Phosphor icons only. Prefer `@/lib/icons` when the icon already exists there
- UI must remain usable on mobile without horizontal scrolling for primary actions
- Preserve keyboard accessibility, semantic markup, visible focus states, readable errors, sufficient contrast, appropriate touch targets, and reduced-motion behavior

### TanStack usage

- Use TanStack Form when a form genuinely benefits from typed client state, field-level validation, touched state, or submission feedback
- Native forms and Server Actions remain appropriate for simpler forms
- Bind TanStack fields to existing Vecalss field and button primitives
- Use TanStack Table for headless table behavior; Vecalss primitives own markup and styling
- Keep canonical pagination, filtering, and cross-page sorting on the server
- Do not add TanStack Query unless there is a demonstrated client-side server-state synchronization need

### Tooling

- Use the pinned **pnpm 10** toolchain (`pnpm@10.33.0`) exclusively — never npm or yarn
- Prefer the repository's package scripts over ad hoc commands
- Route every Node/package/script/test/build command through
  `_harness/resource-guard.sh run -- ...`; use its `status` subcommand for a
  read-only CPU snapshot.
- `pnpm dev` regenerates design tokens and starts Next on port `5023`.
- Start `pnpm dev` only when required, keep one instance maximum, and stop it
  before handoff or another guarded check.
- `pnpm verify` is the normal completion gate (lint plus production build),
  and the repository pre-commit hook runs the guarded form automatically.
- There is no catch-all `pnpm test`; run the named `test:*` or `db:test-*`
  script that covers the changed domain. Import-worker changes also require
  `pnpm admin:imports-worker:check`.
- `pnpm test:scalability` is Docker-backed and should be reserved for shared
  Redis or multi-instance rate-limit changes.
- This is strict TypeScript; consult installed Next.js 16 docs rather than assuming older Next patterns
- Use the `@/` import alias

### Token efficiency and CLI proxy (RTK)

- **Mandatory default:** Proxy supported CLI and shell commands through `rtk` whenever possible to filter, group, and summarize output before LLM context ingestion (saving 60–90%+ context tokens).
- **Supported command coverage:**
  - Git / GitHub: `rtk git status`, `rtk git diff`, `rtk git log`, `rtk git commit`, `rtk gh ...`
  - Search & inspection: `rtk grep`, `rtk rg`, `rtk find`, `rtk ls`, `rtk tree`, `rtk read`
  - Diagnostics / runners: `rtk err <cmd>`, `rtk test <cmd>`, `rtk summary <cmd>`, `rtk json`
  - Node & package scripts: `rtk pnpm ...`, `rtk lint`, `rtk tsc`, `rtk prisma ...`
- **Resource guard synergy:** RTK compresses output; it does not replace CPU and process throttling. All Node, package, script, test, build, lint, and Prisma commands must still run through `_harness/resource-guard.sh`:
  ```bash
  ./_harness/resource-guard.sh run -- rtk pnpm lint
  ./_harness/resource-guard.sh run -- rtk pnpm verify
  ./_harness/resource-guard.sh run -- rtk pnpm test:<area>
  ./_harness/resource-guard.sh run -- rtk pnpm exec prisma <args>
  ```
- Non-heavy commands (e.g. `rtk git status`, `rtk git diff`, `rtk grep`, `rtk find`) do not start Node or heavy background workers and can be run with `rtk` directly without the guard.
- **Escape hatch:** Use `rtk proxy <cmd>` when raw, uncompressed output is strictly necessary for low-level debugging or troubleshooting.

### Browser testing, verification, and usage

- **Dual-browser strategy (`ego-browser` vs `obscura`):**
  - **`ego-browser` (`ego-lite`) is dedicated to tests requiring user/human interaction:** All interactive UI/UX inspection, visual audits with the user, or flows requiring manual user intervention must use `ego-browser`.
  - **Always ask for explicit user permission before launching `ego-browser`.** Never start `ego-browser` autonomously. Specify:
    1. **Route(s):** The exact route(s) or URLs to be checked (e.g., `/mentor/tryouts/new`, `/dashboard`).
    2. **Role:** The user role or persona/session context to use (e.g., Kapten / tutor, Voyager / student, Admin, or unauthenticated).
    3. **Verification items:** The specific checklist of UI elements, interactions, edge cases, responsive views, or user flows to verify.
  - **`obscura` is dedicated to automated, headless, and Playwright tests:** Use for automated test runs, DOM assertions, smoke tests, background verifications, and Playwright suites.
  - **Obscura chosen over Chrome for Playwright:** Choose Obscura over Chrome/Chromium for headless automation (`chromium.connectOverCDP()`). Connect via CDP on port `9222`. Obscura runs autonomously under the resource guard without requiring user confirmation.
  - **Login with seeded credentials:** When testing authenticated user flows, do not register new accounts. Always use the seeded credentials listed in [`docs/agent-app-testing-guide.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/docs/agent-app-testing-guide.md).
  - Detailed guide: [`docs/agent-obscura-guide.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/docs/agent-obscura-guide.md).

### Domain

- Preserve the shared topic taxonomy across learning modules, quizzes, tryouts, analytics, and AI features
- Product-facing "Kapten" maps to the tutor role and `/mentor` routes — do not rename without an explicit migration plan
- Student-facing copy should use natural Bahasa Indonesia. Preserve established admin and technical terminology unless feature requirements say otherwise
- For all copywriting, marketing text, UI copy, and Indonesian content editing, agents must apply the `tutur-humanizer` skill (`.agents/skills-library/domain/tutur-humanizer/SKILL.md`) and `.agents/rules/copywriting.md` to keep copy human, natural, and free from AI clichés

## Code quality policy

- Follow current best practices for Next.js, React, TypeScript, Prisma, security, accessibility, performance, and testing
- Existing code is precedent, not immutable. Improve patterns that are outdated, unsafe, duplicated, weakly typed, inaccessible, or unnecessarily difficult to maintain
- Behavior-preserving refactors within the touched area do not require confirmation
- Refactors must remain proportionate to the task, preserve documented behavior, and include appropriate verification
- Avoid unrelated repository-wide rewrites, formatting churn, premature abstractions, and new dependencies without demonstrated need
- When replacing an established pattern, explain why and migrate consistently to avoid competing patterns
- Prefer clear domain boundaries, explicit types, centralized validation/authorization, reusable primitives, and testable pure logic
- Do not preserve a poor pattern solely for consistency; improve it safely when the task provides a reasonable opportunity

## Commit policy

- **Micro-commit always.** Every logical unit of change must be committed before moving to the next step. Do not accumulate uncommitted work across multiple steps.
- A "logical unit" is the smallest coherent change: a single component, a schema update, a migration, a service function, a test, a config change, etc.
- Use clear, descriptive commit messages that explain *what* changed and *why* when non-obvious.
- Never leave uncommitted changes when switching tasks, pausing, or handing off.
- If a step produces both source changes and generated output (e.g., schema + `pnpm db:generate`, or token edit + `pnpm tokens`), commit them together as one unit.
- The pre-commit hook runs guarded `pnpm verify` for product-code commits — if
  it fails, fix the issue before continuing rather than skipping the commit.
  Harness-only commits use the shell/diff checks and intentionally skip the
  product build.

## Harness evolution

- Core harness files can be updated through user-approved proposals
- When the harness is insufficient, propose changes and wait for approval
- Do not invent extra files, layers, or `_harness/agents.md` unless the user explicitly requests them

### Risk levels for harness changes

| Risk | Examples | Rule |
|---|---|---|
| Low | Adding a routing entry, updating catalog, fixing a typo | Propose inline, apply if user agrees |
| Medium | New rule, new workflow step, changing confirmation boundaries | Summarize change and rationale, wait for explicit approval |
| High | Restructuring harness files, changing memory model, changing GC policy | Write a proposal with full before/after, wait for explicit approval |

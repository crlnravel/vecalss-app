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

All agents on this machine, including Traycer GUI agents, share CPU and process
capacity even when they use separate worktrees. This is a cooperative,
fail-closed policy: commands outside the guard cannot be stopped automatically,
so agents must follow these limits rather than bypassing them.

- Before starting a Node, package, test, build, worker, or other potentially
  CPU-heavy command, run `_harness/resource-guard.sh status`. This read-only
  check uses `ps` and the operating system load average; it does not start Node.
- Launch those commands only through
  `_harness/resource-guard.sh run -- <command>`. The guard uses one lock shared
  by all worktrees of this repository, lowers scheduling priority, and refuses
  a launch when the one-minute load is at least `1.25 × logical CPUs`, two
  matching processes are already at least `25%` CPU, or matching processes
  together use at least `160%` CPU.
- Hard default: one guarded CPU-heavy command group at a time across the
  repository. A long-lived `next`, dev-server, watcher, or worker group counts
  as the one active group and must be stopped before another guarded command.
  Never intentionally keep more than two top-level agent-owned process groups
  alive, even when one is idle.
- Keep explicit Node/package/script launches to three or fewer per agent turn
  and six or fewer per task/session. If that is not enough, stop and ask the
  user; do not self-override the budget. A composite repository command such
  as `pnpm verify` counts as one launch; do not repeat it or a failed command
  without first reading its output.
- Do not use `&`, `nohup`, `disown`, watch/daemon modes, `--parallel`,
  `concurrently`, or ad hoc process farms. Do not run heavy shell calls in
  parallel tool batches. Stop only processes owned by the current agent; never
  use a broad `kill`/`pkill` against another agent's work.
- Use the pinned `pnpm` package scripts and avoid direct `npm`, `npx`, `yarn`,
  or `bun` launches. Do not reinstall dependencies during normal iteration;
  `init.sh` installs only when `node_modules` is absent or package metadata is
  newer than its install marker.
- If the guard reports `BLOCKED` (exit `75`), do not busy-wait or retry. Finish
  read-only work, record the skipped command and snapshot in the handoff, and
  ask the user if more capacity is genuinely needed. If a process listing is
  unavailable, the guard also refuses to launch.
- This is a concurrency and priority guard, not an OS hard CPU quota: one build
  can still use its own worker pool. The safety guarantee comes from not
  starting additional agent work while that group is running.

## Model and delegation policy

The default model for this project and all delegated workers is exact `gpt-5.6-luna` with reasoning effort `max`.

- Every subagent/delegated worker must be started with `gpt-5.6-luna` and `max` reasoning when the runtime exposes those controls.
- Any model other than exact `gpt-5.6-luna` requires explicit user permission before the agent is started or continued. This includes `gpt-5.6-sol`, the unsuffixed `gpt-5.6` alias, Terra, older models, and unverified model names.
- Never infer permission from a prior task, a default supplied by the runtime, or a model that appears capable enough. Ask in the current task and name the requested model.
- If the runtime cannot guarantee or report the selected model, fail closed: do not delegate until the user approves proceeding without verification.

### Branch-aware confirmation gates

- **Feature branches:** Full autonomy. Breaking changes are acceptable.
- **Main/staging branches:** Critical decisions require confirmation (see below).
- **"You can do anything" override:** When the user explicitly says this, all confirmation gates are suspended for the current task.

### What always requires confirmation

- Clarifying or changing user flows and product direction
- Running `pnpm db:reset`, `pnpm db:seed`, or any `db:apply-*` command
- Running destructive migrations or production migration commands
- Adding a runtime dependency or replacing a major library
- Changing established routes, public interfaces, or breaking schema changes
- Introducing a major architectural layer
- Cross-cutting refactors that substantially expand scope or affect routes, database contracts, dependencies, authorization, or externally visible behavior
- Performing browser verification or browser testing (must state routes, role, and verification checklist before launching)

### What does not require confirmation

- Creating new components, modules, or files
- Writing or updating tests
- Behavior-preserving refactors within the touched area
- Fixing lint errors, import ordering, formatting
- Reading specs and documentation
- Running `pnpm lint`, `pnpm verify`, or focused `test:*` scripts
- Minor UI adjustments following DESIGN.md

The resource guard is still mandatory for every process-starting command in
this list; the confirmation rule and the CPU/process rule are separate gates.

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

### Browser testing and verification

- Use **ego-browser** for all browser testing — not Chrome, Firefox, or Safari
- **Always ask for explicit user permission before doing verification using a browser.** Never start browser verification autonomously.
- When requesting permission for browser verification, the agent MUST explicitly specify:
  1. **Route(s):** The exact route(s) or URLs to be checked (e.g., `/mentor/tryouts/new`, `/dashboard`).
  2. **Role:** The user role or persona/session context to use (e.g., Kapten / tutor, Voyager / student, Admin, or unauthenticated).
  3. **Verification items:** The specific checklist of UI elements, interactions, edge cases, responsive views, or user flows to verify.
- Only proceed with browser verification after receiving explicit approval from the user.

### Domain

- Preserve the shared topic taxonomy across learning modules, quizzes, tryouts, analytics, and AI features
- Product-facing "Kapten" maps to the tutor role and `/mentor` routes — do not rename without an explicit migration plan
- Student-facing copy should use natural Bahasa Indonesia. Preserve established admin and technical terminology unless feature requirements say otherwise

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

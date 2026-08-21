---
role: agent-instruction
scope: constraints
description: Constraints, boundaries, and evolution rules
---

# Rules

## Autonomy model

**Default: high autonomy.** Agents should execute without asking unless a confirmation gate applies.

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

### What does not require confirmation

- Creating new components, modules, or files
- Writing or updating tests
- Behavior-preserving refactors within the touched area
- Fixing lint errors, import ordering, formatting
- Reading specs and documentation
- Running `pnpm lint`, `pnpm verify`, or focused `test:*` scripts
- Minor UI adjustments following DESIGN.md

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

- Use **pnpm 10** exclusively — never npm or yarn
- Prefer the repository's package scripts over ad hoc commands
- This is strict TypeScript; consult installed Next.js 16 docs rather than assuming older Next patterns
- Use the `@/` import alias

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

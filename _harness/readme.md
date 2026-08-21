---
role: agent-instruction
scope: project-context
description: Project context and harness overview
---

# Vecalss LMS — Agent Orientation

## What is this project?

Vecalss is a web learning academy and LMS for helping Indonesian students prepare for PTN admission (UTBK/SNBT/TKA). Students study sequential Materi modules, complete Kuis, take timed Tryouts, track progress, and receive recommendations. Kapten (tutors) author and publish content. Admins manage enrollment and platform operations.

## Stack

- **Framework:** Next.js 16 App Router, React 19, strict TypeScript
- **Styling:** Tailwind CSS v4, shadcn, design tokens
- **Data:** Prisma ORM, PostgreSQL, Redis
- **Package manager:** pnpm 10 (port 5023 for dev)
- **Icons:** Phosphor Icons
- **Forms:** TanStack Form (selective), TanStack Table (selective)

## Authoritative sources

| What | Where |
|---|---|
| Product specifications & use cases | `Vecalss LMS Specifications.md` |
| MVP delivery plan & phases | `Vecalss MVP Grand Plan.md` |
| Product context & principles | `PRODUCT.md` |
| Visual design system | `DESIGN.md` + `design-tokens/palette.mjs` |
| Setup, demo accounts, commands | `README.md` |
| Kapten workspace direction | `GUIDE_KAPTEN_PAGE.md` |
| Database schema | `prisma/schema.prisma` |

## Terminology

- **Voyager** = Student (product-facing name)
- **Kapten** = Tutor/content author (maps to tutor role and `/mentor` routes)
- **Vera AI** = AI assistant surface (future feature)

## Harness routing

| Need | File |
|---|---|
| What files to read for a task type | `_harness/routing.md` |
| Project directory structure | `_harness/catalog.md` |
| Constraints, rules, confirmation gates | `_harness/rules.md` |
| Execution procedures and verification | `_harness/workflow.md` |
| Durable project decisions and lessons | `_harness/memory/project.md` |
| Memory cleanup policy | `_harness/gc/POLICY.md` |
| Feature tracking and progress | `_harness/tracking/feature_list.json`, `_harness/tracking/progress.md` |
| Session handoff between agents | `_harness/tracking/session-handoff.md` |
| Session initialization script | `init.sh` |

## Codebase exploration

Use **codegraph** to understand codebase structure, relationships between modules, and call chains before diving into unfamiliar code. This is especially useful when:

- Starting a new feature in an unfamiliar area
- Tracing how a change propagates across modules
- Understanding domain boundaries and dependencies
- Investigating bug reports that span multiple layers

## Agent roles (multi-agent ready)

The harness recognizes these lightweight specialist roles:

- **UI specialist** — visual implementation, design system, tokens, components
- **UX specialist** — user flows, interaction patterns, accessibility
- **Frontend developer** — route pages, client components, state, integration
- **Backend developer** — server logic, database, APIs, auth, services
- **Software architect** — cross-cutting structure, domain boundaries, technical decisions

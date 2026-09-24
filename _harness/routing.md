---
role: agent-instruction
scope: task-routing
description: Task-to-file mapping
---

# Routing

Route to the minimum files needed for each task type. Read this file first to decide what to load.

## Session start (every new session)

1. Read `AGENTS.md` → follow harness routing
2. Read `_harness/tracking/session-handoff.md` for context from the previous session
3. Read `_harness/tracking/feature_list.json` to see current feature state
4. Read `_harness/tracking/progress.md` for in-progress work
5. Run `./init.sh` or follow `_harness/workflow.md` § Session start
6. Pick ONE unfinished feature or continue the active task

## Codebase exploration (before diving into unfamiliar code)

1. Use **codegraph** to map module relationships, call chains, and dependencies in the target area
2. Read `_harness/catalog.md` for directory structure and domain boundaries
3. Then read the specific files identified by codegraph

## New feature

1. Read `_harness/readme.md` for project orientation
2. Read `Vecalss LMS Specifications.md` for relevant use case(s)
3. Read `_harness/catalog.md` to locate affected directories
4. Use **codegraph** to explore dependencies and relationships in the target area
5. Read `_harness/rules.md` for constraints and confirmation gates
6. Read `_harness/workflow.md` for the feature development procedure
7. Read `DESIGN.md` if the feature includes UI
8. Read `_harness/memory/project.md` for relevant settled decisions

## Bug fix

1. Read `_harness/catalog.md` to locate the affected area
2. Use **codegraph** to trace the bug's call chain and affected modules
3. Read the failing code and related tests
4. Read `_harness/rules.md` for confirmation boundaries
5. Read `_harness/workflow.md` § Verification for the completion checklist

## UI work

1. Read `DESIGN.md` and `design-tokens/palette.mjs` for visual decisions
2. Read `_harness/catalog.md` to locate `modules/`, `components/ui/`, relevant routes
3. Read `PRODUCT.md` for product context and terminology
4. Read `_harness/rules.md` § UI and design constraints
5. If the UI involves a new user flow, read `Vecalss LMS Specifications.md` for the relevant use case

## Schema / database change

1. Read `docs/database-environments.md` for environment topology (Local Docker, Staging Neon, Production status) and retrieval rules
2. Read `prisma/schema.prisma` for the current model
3. Read `_harness/rules.md` § Database & legacy policy (Pre-release phase) and § Protected areas
4. Read `_harness/workflow.md` § Prisma migration procedure
5. Read the relevant `lib/` domain code for affected services
6. Read `Vecalss LMS Specifications.md` if the change affects a use case contract

## Testing

1. Read `_harness/catalog.md` to locate `scripts/` and relevant test scripts
2. Read `_harness/workflow.md` § Verification
3. Read the code under test in `lib/`, `modules/`, or `app/`
4. Read `package.json` for available `test:*` scripts

## Refactoring

1. Read `_harness/catalog.md` to understand the affected module boundaries
2. Read `_harness/rules.md` § Code quality policy and § Autonomy model
3. Read the code to refactor and its immediate dependents
4. Read `_harness/workflow.md` § Verification for completion criteria

## Documentation update

1. Read the target document
2. Read `_harness/rules.md` § Protected areas (some docs require confirmation)
3. If updating harness files, read `_harness/rules.md` § Harness evolution

## Shared resource guard

1. Read `.agents/skills/agent-resource-guard/SKILL.md` for the reusable policy
2. Read `_harness/resource-guard.sh` for this repository's configured runtime
3. Read `_harness/resource-policy.md` when setup has generated a local policy

## Copywriting & Indonesian content

1. Read `.agents/skills/tutur-humanizer/SKILL.md`
2. Read `.agents/rules/copywriting.md`
3. Read `.agents/skills/tutur-humanizer/references/register-map.md` for register decisions
4. Audit text against `.agents/skills/tutur-humanizer/references/pattern-bank.md` to remove AI clichés and tells

## Vercel deployment & project management

1. Read `.agents/skills/deploy-to-vercel/SKILL.md` for deployment workflows, team selection, and preview vs. production flows
2. Read `.agents/skills/vercel-cli-with-tokens/SKILL.md` for token authentication (`VERCEL_TOKEN`), environment variables, inspecting deployment/runtime logs, and custom domains
3. Read `.agents/skills/vercel-optimize/SKILL.md` for cost, performance, function invocations, and caching audit

## Task-to-directory quick reference

| Task area | Primary directories |
|---|---|
| Authentication & sessions | `lib/auth/`, `modules/auth/`, `app/login/`, `app/forgot-password/`, `app/reset-password/` |
| Student onboarding | `modules/student/`, `app/onboarding/` |
| Dashboard | `modules/dashboard/`, `app/dashboard/` |
| Materi / courses | `lib/materi/`, `modules/courses/`, `app/courses/` |
| Quiz | `lib/quiz/`, `modules/quiz/`, `app/quiz/` |
| Tryout | `lib/tryout/`, `modules/tryout/`, `app/tryout/` |
| Admin enrollment & ops | `lib/admin/`, `modules/admin/`, `app/admin/` |
| Kapten / mentor | `modules/mentor/`, `app/mentor/` |
| Notifications | `lib/notifications/`, `app/notifications/` |
| Media | `lib/media/`, `modules/media/` |
| Landing / marketing | `modules/home/`, `modules/about/`, `app/about/`, `app/faq/` |
| Vera AI | `modules/vera-ai/`, `app/vera-ai/` |
| Design tokens & styling | `design-tokens/`, `DESIGN.md`, `app/globals.css` |
| Database schema & environments | `docs/database-environments.md`, `prisma/schema.prisma`, `docker-compose.dev.yml` |
| Seeds & fixtures | `prisma/seed.mjs`, `prisma/seed-assessment.mjs`, `prisma/materi-seed.mjs` |
| Background workers | `workers/` |
| Shared UI primitives | `components/ui/` |
| Copywriting & text content | `content/`, `modules/home/`, `.agents/skills/tutur-humanizer/` |
| Vercel deployment & ops | `.agents/skills/deploy-to-vercel/`, `.agents/skills/vercel-cli-with-tokens/`, `.agents/skills/vercel-optimize/` |

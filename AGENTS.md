# AGENTS.md

This repository uses an AGENTS.md harness system.

## How to use this file

**If you just ran `npx agents-md-harness setup`** (or the legacy `init` alias):

You now have the harness framework, but the core files don't exist yet. Tell your AI agent:

> "Help me setup the harness"

The agent will guide you through a conversation to generate customized harness files based on your project.

**If harness files already exist:**

Continue to "Normal usage" section below.

## First-time setup

If `_harness/` core files (readme.md, routing.md, catalog.md, rules.md, workflow.md) don't exist yet:

**You MUST enter setup conversation mode. DO NOT generate files directly.**

### Setup conversation steps:

1. Read `_harness/.setup/PROMPT.md` and `_harness/.setup/FLOW.md`
2. Tell the user: "I need to set up the harness through a conversation. Let me ask you some questions."
3. Go through each stage in FLOW.md, asking questions and waiting for responses:
   - Stage 1: Project and task types
   - Stage 2: Workflow and confirmation boundaries
   - Stage 3: Structure, routing, boundaries, and resource guard
   - Stage 4: Memory and GC model
   - Stage 5: Multi-agent needs
4. After collecting all answers, summarize and ask: "Should I generate the harness files with this configuration?"
5. Only after user confirms, generate files using templates in `_harness/.setup/templates/`

**Files to generate:**

- `_harness/readme.md`
- `_harness/routing.md`
- `_harness/catalog.md`
- `_harness/rules.md`
- `_harness/workflow.md`
- `_harness/memory/project.md`
- `_harness/resource-guard.sh` and `_harness/resource-policy.md` when shared-host protection is enabled

## Normal usage

Once harness is set up:

1. Read this file first
2. Classify the task
3. Load only the minimum relevant documents from `_harness/`

### Model and subagent policy

- The project default for the main agent and every delegated subagent is exact `gpt-6-luna` with reasoning effort `max`.
- Do not silently use `gpt-6-sol`, `gpt-6`, Terra, or any other non-Luna model. The unsuffixed `gpt-6` alias is not an acceptable substitute because it routes to Sol.
- If a runtime, orchestration tool, or user request selects any model other than exact `gpt-6-luna`, stop before starting or continuing that agent and request explicit permission from the user for that model in the current task.
- If the selected model cannot be verified, treat it as non-Luna and request permission. See `_harness/rules.md` for the durable delegation rule.

### CPU and process budget

The reusable policy is in `.agents/skills/agent-resource-guard/SKILL.md` and
the configured project copy is `_harness/resource-guard.sh`.

- Before a Node/package/script launch, run `_harness/resource-guard.sh status`; launch through `_harness/resource-guard.sh run -- <command>`.
- The guard serializes launches across worktrees, checks host/process capacity, lowers scheduling priority, and fails closed when blocked.
- Keep the configured launch budget and one active CPU-heavy command group; stop agent-owned servers and workers before handoff.
- Never bypass the guard with direct launches, background/watch/parallel modes, or a retry loop.
- **Emergency mode (2x more forgiving gates):** When resource checks block critical work, an emergency mode (`--emergency` or `RESOURCE_GUARD_EMERGENCY=1`) relaxes gates to 2x base values. Agents **must always ask for explicit user permission** before invoking emergency mode.

### Token efficiency and CLI proxy (rtk)

- **Use RTK whenever possible:** Prefix supported CLI and shell commands with `rtk` (e.g. `rtk git status`, `rtk git diff`, `rtk grep`, `rtk find`, `rtk ls`, `rtk read`) to filter and summarize command output before LLM context ingestion, saving tokens.
- **Resource guard pairing:** For any Node, package, test, build, lint, or Prisma command, RTK must run inside the shared resource guard:
  `./_harness/resource-guard.sh run -- rtk pnpm <command>` (e.g. `./_harness/resource-guard.sh run -- rtk pnpm lint`, `./_harness/resource-guard.sh run -- rtk pnpm verify`, `./_harness/resource-guard.sh run -- rtk pnpm test:<area>`).
- Never bypass `_harness/resource-guard.sh` for process-heavy or Node-starting commands when using RTK.
- Use `rtk proxy <command>` only when raw unfiltered output is strictly necessary for debugging.

### Database migration and legacy systems policy (Pre-release phase)

- **Active pre-release phase:** The project is in active pre-release development. Local and development database data is ephemeral and disposable.
- **Database migration is encouraged:** Agents are fully permitted to evolve the schema and apply database migrations (`prisma migrate dev`, `pnpm db:generate`, `pnpm db:reset`, `pnpm db:seed`) as needed to support feature development.
- **No legacy preservation or backup requirement:** Creating pre-migration database dumps/backups or preserving legacy tables, obsolete schemas, and backward-compatibility bridges is **not important or required** at this stage. Prioritize clean, modern schemas and moving forward over legacy compatibility.

### Environment and database topology for AI agents

- **Local environment (dev):** Uses Docker Compose (`docker-compose.dev.yml`) providing PostgreSQL 16 (port `55432`, db `vecalss_dev`) and Redis 7 (port `56379`). Ephemeral fixture data; resets and seeds (`pnpm db:reset`, `pnpm db:seed`) are standard.
- **Staging environment (neon):** Uses **Neon** serverless PostgreSQL. **Neon staging contains NO sensitive information** and is **safe for AI agents to retrieve, inspect, and query**. The staging database is **also disposable for now** during this pre-release phase (no backups or legacy preservation required). Migrations are deployed via `prisma migrate deploy`.
- **Production environment:** **Still NOT available.** Agents must fail closed and never connect to or assume an active production database.
- Read [`docs/database-environments.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/docs/database-environments.md) for the complete reference.

### Design and UI policy

- **For any task involving UI, components, styling, layout, or visual design:** Read and follow `DESIGN.md` as the authoritative design system. `DESIGN.md` links to focused guidelines in `docs/design-guidelines/` — load the narrowest relevant guide for the work at hand.
- Do not deviate from its tokens, patterns, or guidelines without explicit user approval.
- `DESIGN.md` is a protected file — propose changes rather than editing directly.

### Copywriting and Indonesian content policy

- **For any task involving copywriting, marketing copy, student/user-facing text, Indonesian prose, or UI microcopy:** Read and apply the `tutur-humanizer` skill (`.agents/skills-library/domain/tutur-humanizer/SKILL.md`) and `.agents/rules/copywriting.md`.
- Student-facing and marketing copy in Vecalss must sound natural, human, and context-appropriate. Avoid robotic AI phrasing, empty buzzwords, corporate padding, and awkward translation calques.
- User-facing copy must be written for nontechnical readers. Do not expose implementation labels or version markers such as `v1`, `version`, `revision`, `UUID`, `UTF-8`, `API`, MIME types, raw field names, or backend error codes. Translate them into clear, actionable Indonesian; keep technical identifiers in code, tests, and internal contracts only.

### Browser usage and verification policy

- **Dual-browser strategy (`ego-browser` vs `obscura`):**
  - **`ego-browser` (`ego-lite`) is dedicated to tests requiring user/human interaction:** All interactive UI/UX inspection, visual audits with the user, or flows requiring manual user intervention must use `ego-browser`.
  - **Always ask for explicit user permission before performing any verification or action using `ego-browser`:**
    When requesting permission, the agent must specify:
    1. **Route(s):** The exact route(s) or URLs to check.
    2. **Role:** The user role or session state (e.g. Kapten, Voyager, Admin).
    3. **Things to check:** Concrete checklist of elements, responsive views, or flows to verify.
    Do not proceed with `ego-browser` verification without explicit user approval.
  - **`obscura` is dedicated to automated, headless, and Playwright tests:** Use for automated test runs, DOM assertions, smoke tests, background verifications, and Playwright suites.
  - **Obscura chosen over Chrome for Playwright:** Choose Obscura over Chrome/Chromium for headless automation (`chromium.connectOverCDP()`). Connect via CDP on port `9222`. Obscura runs autonomously under the resource guard.
  - Read [`docs/agent-obscura-guide.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/docs/agent-obscura-guide.md) and [`docs/agent-app-testing-guide.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/docs/agent-app-testing-guide.md) for the complete reference.

### Testing and seeded credentials policy

- **Login with seeded credentials:** When testing the application (browser verification, end-to-end user flows, API testing), agents should not register new accounts. Login with the pre-seeded credentials at `/login` (e.g. Admin: `admin@vecalss.local` / `Admin12345!`, Kapten/Tutor: `tutor@vecalss.local` / `Tutor12345!`, Voyager/Student: `student@vecalss.local` / `Student12345!`, Affiliator: `affiliator@vecalss.local` / `Affiliator12345!`).
- **Disposable dev database:** Data in the local development database (`vecalss_dev`) is 100% ephemeral and disposable. Agents are explicitly permitted to remove, delete, truncate, reset (`pnpm db:reset`), or reseed (`pnpm db:seed`) existing data in the development database whenever needed. No backups or snapshot archives are required.
- Read [`docs/agent-app-testing-guide.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/docs/agent-app-testing-guide.md) for the complete reference and credentials table.

### Skill hierarchy and execution policy (Matt Pocock priority)

To prevent cognitive overload, conflicting guidance, and prompt bloat, agent skills are strictly tiered. **Matt Pocock's Software Engineering Suite is the primary operational framework** for all engineering, architectural, planning, and debugging tasks.

1. **Tier 1 — Core Operating Engine (Matt Pocock Suite - Mandatory Priority):**
   - **Router:** Always start with `ask-matt` (`.agents/skills-library/matt-pocock/ask-matt/SKILL.md`) when selecting a path or workflow.
   - **Ideation & Alignment:** Use `/grill-with-docs` (`.agents/skills-library/matt-pocock/grill-with-docs/SKILL.md`) in-repo to eliminate ambiguities and capture decisions in `CONTEXT.md` / ADRs. Use `/grill-me` for stateless sessions.
   - **Large / Foggy Efforts:** Use `/wayfinder` (`.agents/skills-library/matt-pocock/wayfinder/SKILL.md`) to build a map of decision tickets before coding.
   - **External Blocker Clarification:** Use `/to-questionnaire` (`.agents/skills-library/matt-pocock/to-questionnaire/SKILL.md`) when blocked by external stakeholders.
   - **Specification & Decomposition:** Use `/to-spec` (`.agents/skills-library/matt-pocock/to-spec/SKILL.md`) to synthesize discussions into specs; use `/to-tickets` (`.agents/skills-library/matt-pocock/to-tickets/SKILL.md`) to decompose specs into tracer-bullet tickets with explicit blocking edges.
   - **Build & Quality:** Run `/implement` (`.agents/skills-library/matt-pocock/implement/SKILL.md`), which drives `/tdd` (`.agents/skills-library/matt-pocock/tdd/SKILL.md`) for test-first development and closes with `/code-review` (`.agents/skills-library/matt-pocock/code-review/SKILL.md`) (Standards + Spec fidelity).
   - **Bug Diagnosis:** Use `/diagnosing-bugs` (`.agents/skills-library/matt-pocock/diagnosing-bugs/SKILL.md`) to lock down a tight, repeatable reproduction before modifying code.
   - **Backlog & PR Triage:** Use `/triage` (`.agents/skills-library/matt-pocock/triage/SKILL.md`) for unvetted bug reports or external PRs.
   - **Architecture & Domain Upkeep:** Use `/improve-codebase-architecture` and `/codebase-design` for deep module design; use `/domain-modeling` to preserve ubiquitous language.
   - **Session Hygiene & Coordination:** Use `/handoff` across phase/agent boundaries, `/resolving-merge-conflicts` for intent-based git resolution, `/shared-worktree-housekeeping` for safe dirty tree checks, and `/wizard` for human-only secrets/dashboards.

2. **Tier 2 — Domain Specialist Skills (Strictly Scoped):**
   - **UI / Frontend:** Must strictly obey `DESIGN.md`. Use `impeccable` (`.agents/skills/impeccable/SKILL.md`) for token alignment and polish, `ui-typography` (`.agents/skills-library/domain/ui-typography/SKILL.md`) for screen typography rules, and `design-audit` (`.agents/skills-library/domain/design-audit/SKILL.md`) for visual audits.
   - **Copywriting:** Apply `tutur-humanizer` (`.agents/skills-library/domain/tutur-humanizer/SKILL.md`) and `.agents/rules/copywriting.md` for student/user-facing Indonesian copy.
   - **Cloud & DB:** Use `neon` / `neon-postgres` for database branching/pooling, and `deploy-to-vercel` / `vercel-cli-with-tokens` / `vercel-optimize` for Vercel deployment and cost audit.
   - **Host Protection & Harness:** Enforce `agent-resource-guard` (`_harness/resource-guard.sh`) for CPU gating and `harness` (`_harness/skills/harness/SKILL.md`) for harness auditing.

3. **Tier 3 — Archived (Physically removed from runtime injection):**
   - The following skills have been moved to `.agents/skills-archive/` and are no longer injected into the agent context. They can be restored on explicit user request.
   - **Aesthetics** (`.agents/skills-archive/tier-3-aesthetics/`): `bencium-controlled-ux-designer`, `bencium-impact-designer`, `bencium-innovative-ux-designer`, `gpt-taste`, `minimalist-ui`, `high-end-visual-design`, `redesign-existing-projects`, `renaissance-architecture`.
   - **Niche theory** (`.agents/skills-archive/niche-theory/`): `agentic-ux-design-relationship-centric-interfaces`, `information-architecture`.
   - **Unused tech** (`.agents/skills-archive/unused-tech/`): `prisma-composer-core-concepts`.
   - **Setup scripts** (`.agents/skills-archive/setup-scripts/`): `setup-matt-pocock-skills`.

### Routing

- Project overview → `_harness/readme.md`
- Task-to-file routing → `_harness/routing.md`
- Skill knowledge graph & decision tree → `_harness/skill-map.md`
- Project structure lookup → `_harness/catalog.md`
- Hard rules and constraints → `_harness/rules.md`
- Execution procedures → `_harness/workflow.md`
- App testing & seeded login → `docs/agent-app-testing-guide.md`
- Automated headless testing & Playwright (Obscura) → `docs/agent-obscura-guide.md`
- Database & environments guide → `docs/database-environments.md`
- Copywriting & Indonesian content → `.agents/skills-library/domain/tutur-humanizer/SKILL.md` and `_harness/routing.md`
- CPU/process budget and guarded launches → `.agents/skills/agent-resource-guard/SKILL.md` and `_harness/resource-guard.sh`

#### Skill routing quick reference

| Need / Task | Primary skill / flow | Path |
|---|---|---|
| Selecting a flow / routing | `ask-matt` | `.agents/skills-library/matt-pocock/ask-matt/SKILL.md` |
| Sharpening ideas / scoping feature | `grill-with-docs` | `.agents/skills-library/matt-pocock/grill-with-docs/SKILL.md` |
| Planning large foggy initiatives | `wayfinder` | `.agents/skills-library/matt-pocock/wayfinder/SKILL.md` |
| Formulating questions for stakeholders | `to-questionnaire` | `.agents/skills-library/matt-pocock/to-questionnaire/SKILL.md` |
| Synthesizing spec from discussion | `to-spec` | `.agents/skills-library/matt-pocock/to-spec/SKILL.md` |
| Decomposing spec into tickets | `to-tickets` | `.agents/skills-library/matt-pocock/to-tickets/SKILL.md` |
| Implementing tickets test-first | `implement` (drives `tdd`) | `.agents/skills-library/matt-pocock/implement/SKILL.md` |
| Reviewing diffs (Standards + Spec) | `code-review` | `.agents/skills-library/matt-pocock/code-review/SKILL.md` |
| Investigating difficult bugs / flakes | `diagnosing-bugs` | `.agents/skills-library/matt-pocock/diagnosing-bugs/SKILL.md` |
| Triaging incoming bugs & PRs | `triage` | `.agents/skills-library/matt-pocock/triage/SKILL.md` |
| Deep-module architecture review | `improve-codebase-architecture` | `.agents/skills-library/matt-pocock/improve-codebase-architecture/SKILL.md` |
| Domain dictionary & ADR discipline | `domain-modeling` | `.agents/skills-library/matt-pocock/domain-modeling/SKILL.md` |
| Session boundary / context handoff | `handoff` | `.agents/skills-library/matt-pocock/handoff/SKILL.md` |
| Resolving merge conflicts | `resolving-merge-conflicts` | `.agents/skills-library/matt-pocock/resolving-merge-conflicts/SKILL.md` |
| Human-only steps (secrets, cloud UI) | `wizard` | `.agents/skills-library/matt-pocock/wizard/SKILL.md` |
| UI implementation & polish | `impeccable` (governed by `DESIGN.md`) | `.agents/skills/impeccable/SKILL.md` |
| Screen typography rules | `ui-typography` | `.agents/skills-library/domain/ui-typography/SKILL.md` |
| UI/UX visual audit | `design-audit` | `.agents/skills-library/domain/design-audit/SKILL.md` |
| Indonesian copywriting / tone | `tutur-humanizer` | `.agents/skills-library/domain/tutur-humanizer/SKILL.md` |
| Neon PostgreSQL operations | `neon` / `neon-postgres` | `.agents/skills-library/domain/neon/SKILL.md` |
| Vercel deployment & optimization | `deploy-to-vercel` / `vercel-optimize` | `.agents/skills-library/domain/deploy-to-vercel/SKILL.md` |
| Shared CPU & process budgeting | `agent-resource-guard` | `_harness/resource-guard.sh` |
| Harness self-audit & token check | `harness` | `_harness/skills/harness/SKILL.md` |


### Loading Principles

- Prefer minimum necessary reads
- Route before loading
- Load the most relevant file first
- Combine multiple files only when truly needed

## Memory

- Shared long-term memory: `_harness/memory/project.md`
- Per-agent short-term memory: `_harness/memory/agents/*.local.md`

## Evolution

This harness evolves with the project:

- Core harness files can be updated through user-approved proposals
- When harness is insufficient, propose changes and wait for approval
- See `_harness/rules.md` for evolution rules and risk levels

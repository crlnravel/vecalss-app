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
   - Stage 3: Structure, routing, and boundaries
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

## Normal usage

Once harness is set up:

1. Read this file first
2. Classify the task
3. Load only the minimum relevant documents from `_harness/`

### Model and subagent policy

- The project default for the main agent and every delegated subagent is exact `gpt-5.6-luna` with reasoning effort `max`.
- Do not silently use `gpt-5.6-sol`, `gpt-5.6`, Terra, or any other non-Luna model. The unsuffixed `gpt-5.6` alias is not an acceptable substitute because it routes to Sol.
- If a runtime, orchestration tool, or user request selects any model other than exact `gpt-5.6-luna`, stop before starting or continuing that agent and request explicit permission from the user for that model in the current task.
- If the selected model cannot be verified, treat it as non-Luna and request permission. See `_harness/rules.md` for the durable delegation rule.

### CPU and process budget

- All agents, including Traycer agents and their children, share the host's CPU budget. Do not start more than one CPU-heavy command group at a time for this repository, and do not leave more than one long-lived dev/worker process running.
- Before a Node/package/script launch, run `_harness/resource-guard.sh status`; launch through `_harness/resource-guard.sh run -- <command>`. The guard checks CPU/load, serializes launches across worktrees, and fails closed when the host is busy.
- Keep process-starting commands to three or fewer per agent turn. Never use background/watch/parallel launch modes or retry a busy guard in a loop. Stop agent-owned servers and workers before handoff.

### Design and UI policy

- **For any task involving UI, components, styling, layout, or visual design:** Read and follow `DESIGN.md` as the authoritative design system. `DESIGN.md` links to focused guidelines in `docs/design-guidelines/` — load the narrowest relevant guide for the work at hand.
- Do not deviate from its tokens, patterns, or guidelines without explicit user approval.
- `DESIGN.md` is a protected file — propose changes rather than editing directly.

### Browser verification policy

- **Always ask for explicit user permission before performing any verification using a browser (`ego-browser`).**
- When requesting permission, the agent must specify:
  1. **Route(s):** The exact route(s) or URLs to check.
  2. **Role:** The user role or session state (e.g. Kapten, Voyager, Admin).
  3. **Things to check:** Concrete checklist of elements, responsive views, or flows to verify.
- Do not proceed with browser verification without explicit user approval.

### Routing

- Project overview → `_harness/readme.md`
- Task-to-file routing → `_harness/routing.md`
- Project structure lookup → `_harness/catalog.md`
- Hard rules and constraints → `_harness/rules.md`
- Execution procedures → `_harness/workflow.md`
- CPU/process budget and guarded launches → `_harness/resource-guard.sh` and `_harness/rules.md`

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

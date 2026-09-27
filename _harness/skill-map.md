---
role: agent-instruction
scope: skill-routing
description: Knowledge graph for lazy-loaded skill discovery. Consult this before reading any SKILL.md.
---

# Skill Map

Compact decision graph for skill routing. The agent reads this to find the right
skill, then `view_file` on the specific SKILL.md. Skills live in
`.agents/skills-library/` (lazy) or `.agents/skills/` (hook-wired).

## Flow: idea → ship (Matt Pocock lifecycle)

```
grill-with-docs ──→ to-spec ──→ to-tickets ──→ implement ──→ done
       │                                          ├── tdd
       │                                          └── code-review
       ├── (need prototype?) ──→ prototype
       └── (foggy/huge?) ──→ wayfinder ──→ to-spec
```

On-ramps:
- Bug report → `diagnosing-bugs` → `tdd` (regression test) → `code-review`
- Incoming issue/PR → `triage` → `implement`
- Architecture debt → `improve-codebase-architecture` → `grill-with-docs`

## Tier 1 — Matt Pocock Suite (default for all engineering)

| Phase | Skill | Path |
|---|---|---|
| Route to right flow | `ask-matt` | `.agents/skills-library/matt-pocock/ask-matt/SKILL.md` |
| Sharpen idea (in-repo) | `grill-with-docs` | `.agents/skills-library/matt-pocock/grill-with-docs/SKILL.md` |
| Sharpen idea (stateless) | `grill-me` | `.agents/skills-library/matt-pocock/grill-me/SKILL.md` |
| Interview primitive | `grilling` | `.agents/skills-library/matt-pocock/grilling/SKILL.md` |
| Plan large initiative | `wayfinder` | `.agents/skills-library/matt-pocock/wayfinder/SKILL.md` |
| Ask external stakeholder | `to-questionnaire` | `.agents/skills-library/matt-pocock/to-questionnaire/SKILL.md` |
| Synthesize spec | `to-spec` | `.agents/skills-library/matt-pocock/to-spec/SKILL.md` |
| Decompose to tickets | `to-tickets` | `.agents/skills-library/matt-pocock/to-tickets/SKILL.md` |
| Build (drives tdd+review) | `implement` | `.agents/skills-library/matt-pocock/implement/SKILL.md` |
| Test-first development | `tdd` | `.agents/skills-library/matt-pocock/tdd/SKILL.md` |
| Two-axis diff review | `code-review` | `.agents/skills-library/matt-pocock/code-review/SKILL.md` |
| Hard bug diagnosis | `diagnosing-bugs` | `.agents/skills-library/matt-pocock/diagnosing-bugs/SKILL.md` |
| Incoming issue triage | `triage` | `.agents/skills-library/matt-pocock/triage/SKILL.md` |
| Module architecture | `improve-codebase-architecture` | `.agents/skills-library/matt-pocock/improve-codebase-architecture/SKILL.md` |
| Deep-module vocabulary | `codebase-design` | `.agents/skills-library/matt-pocock/codebase-design/SKILL.md` |
| Domain dictionary / ADRs | `domain-modeling` | `.agents/skills-library/matt-pocock/domain-modeling/SKILL.md` |
| Throwaway prototype | `prototype` | `.agents/skills-library/matt-pocock/prototype/SKILL.md` |
| Background research | `research` | `.agents/skills-library/matt-pocock/research/SKILL.md` |
| Session context handoff | `handoff` | `.agents/skills-library/matt-pocock/handoff/SKILL.md` |
| Merge conflict resolution | `resolving-merge-conflicts` | `.agents/skills-library/matt-pocock/resolving-merge-conflicts/SKILL.md` |
| Dirty worktree safety | `shared-worktree-housekeeping` | `.agents/skills-library/matt-pocock/shared-worktree-housekeeping/SKILL.md` |
| Human-only wizard | `wizard` | `.agents/skills-library/matt-pocock/wizard/SKILL.md` |
| Re-pitch unclear message | `wait-what` | `.agents/skills-library/matt-pocock/wait-what/SKILL.md` |
| Teach a concept | `teach` | `.agents/skills-library/matt-pocock/teach/SKILL.md` |
| Write agent documents | `writing-for-agents` | `.agents/skills-library/matt-pocock/writing-for-agents/SKILL.md` |

## Tier 2 — Domain specialists

### UI / Frontend (governed by DESIGN.md)

| Need | Skill | Path |
|---|---|---|
| Craft, polish, tokens | `impeccable` | `.agents/skills/impeccable/SKILL.md` |
| Screen typography | `ui-typography` | `.agents/skills-library/domain/ui-typography/SKILL.md` |
| Visual audit | `design-audit` | `.agents/skills-library/domain/design-audit/SKILL.md` |

### Copywriting

| Need | Skill | Path |
|---|---|---|
| Indonesian tone/humanize | `tutur-humanizer` | `.agents/skills-library/domain/tutur-humanizer/SKILL.md` |

### Database & Cloud

| Need | Skill | Path |
|---|---|---|
| Neon platform overview | `neon` | `.agents/skills-library/domain/neon/SKILL.md` |
| Postgres operations | `neon-postgres` | `.agents/skills-library/domain/neon-postgres/SKILL.md` |
| Vercel deployment | `deploy-to-vercel` | `.agents/skills-library/domain/deploy-to-vercel/SKILL.md` |
| Vercel CLI + tokens | `vercel-cli-with-tokens` | `.agents/skills-library/domain/vercel-cli-with-tokens/SKILL.md` |
| Vercel cost/perf audit | `vercel-optimize` | `.agents/skills-library/domain/vercel-optimize/SKILL.md` |

### Agent Infrastructure

| Need | Skill | Path |
|---|---|---|
| CPU/process guard | `agent-resource-guard` | `.agents/skills/agent-resource-guard/SKILL.md` |
| Harness audit | `harness` | `_harness/skills/harness/SKILL.md` |
| Harness creation | `harness-creator` | `.agents/skills-library/domain/harness-creator/SKILL.md` |

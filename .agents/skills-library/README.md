# Skills Library

This directory contains the project's **lazy-loaded agent skills**.

Unlike `.agents/skills/` (which the runtime auto-scans and injects into the prompt on every turn),
skills in this library are loaded **on-demand** by agents when needed, keeping the default
system prompt light and focused.

## Routing

Consult [`_harness/skill-map.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/_harness/skill-map.md) for the decision graph and lifecycle flow.

## Structure

```
.agents/skills-library/
├── matt-pocock/     # Tier 1: Core engineering lifecycle (25 skills)
│   ├── ask-matt/
│   ├── grill-with-docs/
│   ├── implement/
│   ├── tdd/
│   ├── code-review/
│   ├── diagnosing-bugs/
│   └── ...
│
└── domain/          # Tier 2: Domain specialist skills (9 skills)
    ├── ui-typography/
    ├── design-audit/
    ├── tutur-humanizer/
    ├── neon/
    ├── neon-postgres/
    ├── deploy-to-vercel/
    ├── vercel-cli-with-tokens/
    ├── vercel-optimize/
    └── harness-creator/
```

## Eagerly Loaded Skills (in `.agents/skills/`)

Only hook-dependent and process-guard skills stay in `.agents/skills/`:
- `impeccable`: Wired into `.codex/hooks.json`
- `agent-resource-guard`: Host CPU and process budgeting runtime

# Domain Docs

How engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- `CONTEXT.md` at the repo root.
- `docs/adr/` for decisions that touch the area you're working in.

If either location has no relevant files, proceed silently. Don't flag the absence or suggest creating the files upfront; `/domain-modeling` creates them lazily when a term or decision is resolved.

## File structure

This is a single-context repo:

```
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Use the glossary's vocabulary

When naming a domain concept in an issue, proposal, or test, use the term defined in `CONTEXT.md`. If a needed concept is missing, reconsider the terminology or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If your work contradicts an existing ADR, surface the conflict instead of silently overriding it.

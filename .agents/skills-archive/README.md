# Skills Archive

Skills in this directory have been **physically removed from the agent runtime**
so they are no longer injected into the system prompt context window.

They are preserved here for reference and can be restored to `.agents/skills/`
if explicitly requested by the user.

## Categories

| Directory | Contents | Why archived |
|---|---|---|
| `tier-3-aesthetics/` | 8 alternate visual/aesthetic generator skills | Conflict with `DESIGN.md`; `impeccable` + `design-audit` + `ui-typography` cover UI |
| `niche-theory/` | `agentic-ux-design-relationship-centric-interfaces`, `information-architecture` | Abstract theory not needed for daily feature work |
| `unused-tech/` | `prisma-composer-core-concepts` | Project uses Prisma + Neon, not `@prisma/composer` |
| `setup-scripts/` | `setup-matt-pocock-skills` | One-time setup already completed |

## Restoring a skill

Move it back to `.agents/skills/`:

```bash
mv .agents/skills-archive/<category>/<skill-name> .agents/skills/
```

If the skill was previously symlinked in `.claude/skills/`, recreate the symlink:

```bash
ln -s ../../.agents/skills/<skill-name> .claude/skills/<skill-name>
```

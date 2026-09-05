# RTK - Token-Optimized CLI Proxy

**Purpose:** Reduce LLM context token consumption by 60–90%+ by proxying CLI commands through `rtk` to filter, group, and summarize outputs.

## Core Rules

1. **Always use RTK for supported commands:**
   - **Git / GitHub:** `rtk git status`, `rtk git diff`, `rtk git log`, `rtk git commit`, `rtk gh ...`
   - **Search & Inspection:** `rtk grep`, `rtk rg`, `rtk find`, `rtk ls`, `rtk tree`, `rtk read`
   - **Diagnostics & Runners:** `rtk err <cmd>`, `rtk test <cmd>`, `rtk summary <cmd>`, `rtk json`
   - **Node / JS Tooling:** `rtk pnpm ...`, `rtk lint`, `rtk tsc`, `rtk prisma ...`

2. **Cooperate with the Resource Guard:**
   In this repository, any command that starts Node, tests, builds, linting, or Prisma MUST be executed through the shared resource guard:
   ```bash
   ./_harness/resource-guard.sh run -- rtk pnpm lint
   ./_harness/resource-guard.sh run -- rtk pnpm verify
   ./_harness/resource-guard.sh run -- rtk pnpm test:<area>
   ./_harness/resource-guard.sh run -- rtk pnpm exec prisma <args>
   ```
   Do not bypass `_harness/resource-guard.sh`. Non-heavy shell commands (e.g., `rtk git status`, `rtk git diff`, `rtk grep`) can be invoked with `rtk` directly.

3. **Debugging Escape Hatch:**
   If raw uncompressed output is strictly necessary for debugging, use `rtk proxy <cmd>`.

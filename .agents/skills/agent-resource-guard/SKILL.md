---
name: agent-resource-guard
description: >-
  Enforce cooperative CPU, process, and launch limits for coding agents that
  share a host. Use when setting up a harness, adding a fail-closed resource
  guard, or tuning concurrent command limits across worktrees.
license: MIT
---

# Agent Resource Guard

Use this skill when several coding agents, workers, watchers, or development
servers can compete for the same machine. It separates the policy agents must
follow from the project-local shell implementation that enforces safe launches.

## Goal

Keep agent-owned work cooperative and fail closed:

- Inspect load and matching processes before starting CPU-heavy work.
- Serialize guarded launches with one lock shared by repository worktrees.
- Refuse a launch when the host or existing agent work is already busy.
- Run accepted commands at lower scheduling priority.
- Bound agent launch frequency and long-lived process groups in instructions.

This is a concurrency and priority guard, not an operating-system CPU quota.

## Setup

During harness setup, ask whether the project shares a host with other agents.
When enabled, ask for these values and record them in the generated policy:

| Setting | Default | Meaning |
|---|---:|---|
| Load factor | `1.25` | Block at or above this multiple of logical CPUs |
| Hot-process CPU | `25` | A matching process is hot at or above this percentage |
| Maximum hot processes | `2` | Maximum hot matching processes before blocking |
| Total matching CPU | `160` | Maximum combined matching CPU percentage before blocking |
| Launches per turn | `3` | Instruction-level budget for one agent turn |
| Launches per session | `6` | Instruction-level budget for one task/session |

The defaults reproduce the extracted Vecalss policy. Use the setup helper to
render a project-local guard and policy rather than editing generated shell by
hand:

```bash
node .agents/skills/agent-resource-guard/scripts/setup-resource-guard.mjs \
  --target /path/to/project --interactive
```

For non-interactive setup, pass explicit values such as:

```bash
node .agents/skills/agent-resource-guard/scripts/setup-resource-guard.mjs \
  --target /path/to/project \
  --load-factor 1.25 \
  --hot-process-cpu 25 \
  --max-hot-processes 2 \
  --max-total-cpu 160 \
  --max-launches-per-turn 3 \
  --max-launches-per-session 6
```

The helper writes `_harness/resource-guard.sh` and
`_harness/resource-policy.md`. It does not overwrite either file unless
`--force` is supplied. Include the policy file from the project's `AGENTS.md`
or rules document after setup.

## Runtime contract

The generated guard exposes three commands:

```bash
./_harness/resource-guard.sh status
./_harness/resource-guard.sh check
./_harness/resource-guard.sh run -- <command> [args...]
```

- `status` is read-only and prints logical CPUs, one-minute load, and matching
  Node/package/build processes. It must not start Node.
- `check` performs the same snapshot and exits `75` when the guard blocks.
- `run --` acquires the repository lock, performs the check, and runs the
  command with lower scheduling priority.

The process matcher should cover the project's runtimes and build tools, such
as `node`, package managers, `tsx`, `next`, `prisma`, `vite`, `turbo`, and
TypeScript/ESLint workers. Keep the matcher conservative so unrelated system
processes do not consume the agent budget.

## Agent policy

The shell guard cannot know where a chat turn or task session begins and ends,
so launch budgets are instruction-level rules:

- Keep guarded process-starting commands to the configured per-turn and
  per-session limits.
- Count a composite repository command as one launch. Do not repeat a command,
  including a failed one, until its output has been read.
- If the configured budget is insufficient, stop and ask the user rather than
  overriding it.
- Allow one guarded CPU-heavy command group at a time across the repository.
- Treat a long-lived dev server, watcher, or worker as the active group and
  stop it before another guarded command.
- Never intentionally keep more than two top-level agent-owned process groups
  alive, even when one is idle.
- Do not use `&`, `nohup`, `disown`, watch/daemon modes, `--parallel`,
  `concurrently`, or ad hoc process farms. Do not run heavy shell calls in
  parallel tool batches.
- One build may use its own worker pool; the safety guarantee comes from not
  starting additional agent work while that group is running.

## Fail-closed behavior

- If process listing, logical CPU count, or load average is unavailable, refuse
  to start the command.
- If another guarded command owns the repository lock, stop and continue with
  read-only work; do not busy-wait or retry in a loop. Record the skipped
  command and resource snapshot in the session handoff, then ask the user if
  more capacity is genuinely needed.
- Stop only processes owned by the current agent. Never use broad `kill` or
  `pkill` commands against another agent's work.
- Do not bypass the guard with a direct Node, package-manager, test, build,
  worker, or development-server launch.
- The confirmation policy for a command and the resource check are separate
  gates; satisfying one never bypasses the other.

## Constraints

- The guard must use only lightweight host inspection before launching work.
- Generated values must be validated as numeric thresholds during setup.
- Keep the shared lock in temporary storage and scope its key to the
  repository's common Git directory when available.
- Preserve unrelated project changes when installing or updating the guard.
- Require explicit `--force` before replacing an existing guard or policy.

## Files

- [Guard template](templates/resource-guard.sh) - parameterized shell guard.
- [Policy template](templates/resource-policy.md) - copyable agent rule.
- [Setup helper](scripts/setup-resource-guard.mjs) - interactive or flag-based
  renderer for a target repository.

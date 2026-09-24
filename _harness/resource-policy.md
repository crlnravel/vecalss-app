---
role: agent-instruction
scope: resource-safety
description: Shared CPU, process, and launch limits for coding agents
---

# Agent Resource Limits

All agents and agent-owned workers share the host's CPU and process capacity,
including agents in separate worktrees. This is a cooperative, fail-closed
policy. Commands outside the guard cannot be stopped automatically, so agents
must follow these limits rather than bypassing them.

## Guarded commands

- Before a Node, package, test, build, worker, or other CPU-heavy command, run
  `_harness/resource-guard.sh status`.
- Launch those commands only through
  `_harness/resource-guard.sh run -- <command> [args...]`.
- The guard uses one lock shared by the repository worktrees, lowers scheduling
  priority, and refuses a launch when any configured threshold is exceeded.

## Current thresholds (Standard profile)

- Block when one-minute load is at least `2.0 x logical CPUs`.
- A matching process is hot at or above `35%` CPU.
- Block when at least `4` matching processes are hot.
- Block when matching processes together use at least `350%` CPU.
- Keep process-starting commands to `3` or fewer per agent turn and `6` or fewer per task/session.
- Count a composite repository command as one launch. Do not repeat a command,
  including a failed one, until its output has been read. If the budget is
  insufficient, stop and ask the user rather than overriding it.

## Emergency Mode (2x multiplier gate)

Emergency mode allows agents and developers to proceed with high-priority or blocked workloads by relaxing threshold gates to 2x base values:

- **Load factor:** `4.0 x logical CPUs` (load ceiling: 40.0 on a 10-core machine).
- **Hot-process CPU:** `70%` CPU per matching process.
- **Max hot processes:** `8` simultaneous hot processes.
- **Total matching CPU:** `700%` aggregate matching CPU usage (7.0 cores).
- **Activation:** Pass `--emergency` (e.g. `_harness/resource-guard.sh run --emergency -- <command>`) or export `RESOURCE_GUARD_EMERGENCY=1`.

### Mandatory user permission for Emergency Mode
**Agents MUST NEVER activate emergency mode autonomously.**
If a command is blocked under standard thresholds and the agent determines emergency mode is needed:
1. Stop execution.
2. Present the resource block reason and the command that needs to run.
3. Explicitly ask the user for permission to invoke `--emergency`.
4. Only proceed with `--emergency` after receiving explicit confirmation from the user.

## Group and failure rules

- Allow one guarded CPU-heavy command group at a time across the repository.
- A long-lived development server, watcher, or worker counts as the active
  group and must be stopped before another guarded command.
- Never intentionally keep more than two top-level agent-owned process groups
  alive, even when one is idle.
- If the guard reports `BLOCKED` with exit `75`, do not busy-wait or retry.
  Record the skipped command and snapshot in the session handoff, then continue
  with read-only work until capacity is available. Ask the user if more
  capacity is genuinely needed.
- If process listing, CPU count, or load average is unavailable, the guard
  refuses to launch.
- Do not use `&`, `nohup`, `disown`, watch/daemon modes, `--parallel`,
  `concurrently`, or ad hoc process farms. Do not run heavy shell calls in
  parallel tool batches.
- Stop only processes owned by the current agent. Never use a broad `kill` or
  `pkill` against another agent's process.
- One build may use its own worker pool; do not start additional agent work
  while that group is running.

The resource check is separate from command confirmation and permission rules.
Passing one gate does not bypass the other.

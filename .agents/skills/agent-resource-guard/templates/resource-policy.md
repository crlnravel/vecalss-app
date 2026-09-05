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
  `{{GUARD_PATH}} status`.
- Launch those commands only through
  `{{GUARD_PATH}} run -- <command> [args...]`.
- The guard uses one lock shared by the repository worktrees, lowers scheduling
  priority, and refuses a launch when any configured threshold is exceeded.

## Current thresholds

- Block when one-minute load is at least `{{MAX_LOAD_FACTOR}} x logical CPUs`.
- A matching process is hot at or above `{{HOT_PROCESS_CPU}}%` CPU.
- Block when at least `{{MAX_HOT_PROCESSES}}` matching processes are hot.
- Block when matching processes together use at least `{{MAX_TOTAL_CPU}}%` CPU.
- Keep process-starting commands to `{{MAX_LAUNCHES_PER_TURN}}` or fewer per
  agent turn and `{{MAX_LAUNCHES_PER_SESSION}}` or fewer per task/session.
- Count a composite repository command as one launch. Do not repeat a command,
  including a failed one, until its output has been read. If the budget is
  insufficient, stop and ask the user rather than overriding it.

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

---
name: shared-worktree-housekeeping
description: Safely performs project housekeeping, read-only audits, and concurrent-agent reviews in a shared dirty worktree. Use when the user asks to inspect, clean up, review, archive, delete, reset, stage, or coordinate repository paths across a workspace with existing or parallel changes.
---

# Shared-worktree housekeeping

Use this skill for housekeeping, audit, or review work where other agents may have changes in the same worktree.

## Scope and ownership

1. Before inspecting or acting, state the exact task scope and identify every repository path you own or plan to edit. If you own none, say so explicitly.
2. Treat existing shared dirty hunks as concurrent-owned unless an explicit handoff says otherwise. Preserve unrelated changes, including documentation, harness-memory, tracking, and wiki paths.
3. Do not expand the requested scope. Keep ambiguous, unowned, parent-owned, excluded, or merely inactive paths out of the operation until their ownership and authorization are explicit.

## Read-only audits and reviews

4. For an audit or source-only review, explicitly confirm that this run and its descendants will not mutate repository or source paths. Do not clean, delete, reset, revert, stage, overwrite, run database writes/resets/migrations, or make other destructive changes.
5. Review only the named artifacts and the evidence needed to validate them. When browser evidence is unauthorized or the request is source-only, do not use a browser or claim browser-based evidence.
6. Write only the specifically requested review artifact or dated verdict; do not silently repair the reviewed source, plan, ticket, or product artifact.

## Cleanup and handoff

7. For any requested mutation, first inventory the current state and present the exact target paths and proposed operation. Require explicit approval for those exact targets; leave every unapproved or ambiguous target unchanged.
8. Use the project’s guarded tooling, check whether the operation can cascade beyond the named target, and verify the resulting state. Stop and report immediately if a side effect, target expansion, or unexpected deletion occurs.
9. In multi-agent work, send a completion handoff listing exact changed and still-owned paths, and explicitly state when owned files are safe for the coordinator or parent agent to modify. Do not infer release from inactivity or from ownership alone.
10. In the final report, distinguish paths changed by this run from pre-existing dirty paths, state what was preserved, and record any verification or recovery limitation.
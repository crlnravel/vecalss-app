---
role: agent-instruction
scope: skills-overview
---

# Skills

Project-specific agent skills and capabilities.

## Purpose

Store reusable skills, workflows, and specialized capabilities for this project.

## Structure

- Place skill definitions here as markdown files
- Group skills by domain when that improves routing clarity
- Use `skills/harness/` for capabilities that inspect or improve `AGENTS.md` and `_harness/`
- A skill directory can include support scripts when the capability needs structured measurement
- Each skill should be self-contained
- Skills can reference harness files for context

Cross-project skills live under `.agents/skills/`. The shared CPU/process
policy is available there as `agent-resource-guard`; `_harness/resource-guard.sh`
is this repository's configured copy.

---
role: agent-memory
scope: project
---

# Project Memory

Long-term project memory for development-emergent decisions and lessons.

Store only settled decisions, conventions, and important context that emerged during development and cannot be reliably inferred from code or documentation. Do not duplicate product specifications or design system content.

## Conventions

- Admin student preview reads use a server-resolved fixed fixture subject and a
  separate admin actor; preview UI must not accept arbitrary student IDs or
  impersonate the fixture session.
- Preview Beranda/Materi data is exposed through dedicated read wrappers and an
  explicit forbidden-effects contract. Stored learning text is rendered as
  sanitized text, known video providers require HTTPS, and managed documents
  are delivered through a private no-store preview route.

## Lessons

- Re-running the standalone build can fail while Next cleans a previously
  populated `.next/standalone/.next`; a clean generated `.next` directory
  makes the verification build deterministic.

## Decisions

- The admin preview route family is dynamic and no-store, and its read-side
  content boundary rejects persistence writes, queues/events, analytics,
  notifications, webhooks, external writes, delayed jobs, and learner-state
  mutations.

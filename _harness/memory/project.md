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
- Kuis and Tryout preview surfaces use explicit recursive allowlists; Tryout restart uses a fixed safe retake policy, transaction-scoped advisory locks, an idempotency row keyed by preview student + request ID, and supersedes the prior current assignment without creating attempts.
- Banner editing is available only at the admin preview route, uses the CodeMirror editor with hidden form values, and keeps draft/admin-preview/published loaders and revalidation paths separate.

## Assessment state normalization

- AS-03 keeps canonical StandaloneQuiz and Tryout attempt, scoring, and release
  states separate; legacy ModuleQuiz remains isolated.
- Immutable Kuis form snapshots and Tryout run snapshots are the scoring source
  of truth. Reporting reads materialized answer/run/breakdown fields while
  calculation JSON remains audit/replay evidence.
- Tryout aggregation is transaction-local after the seventh canonical section
  seals. A run must belong to the same Tryout section ID and sequence; an
  abandoned, void, incomplete, or rankingless result cannot be released.
- Legacy migration data is conservative: malformed JSON, missing explanation
  text/assets, noncanonical seven-run sets, and missing typed breakdowns stay
  review-required/hidden rather than being guessed into a score.
- AS-03 migration 20260822100000_normalize_assessment_scoring_release is
  intentionally pending until explicit deployment approval. AS-09 durable
  AssessmentRelease remains a later slice.
- AS-03 implementation is committed as `cb1eb8f`; the post-fix follow-up adds
  session-level Tryout release synchronization, stable release timestamps,
  final-run deadline aggregation, CAT owner/admin mutation checks, and typed
  release-bundle validation. The migration now quarantines malformed or
  contradictory legacy JSON/CAT selections, requires canonical seven distinct
  subjects, updates existing typed breakdowns idempotently, proves raw-score
  sums against frozen snapshots, and range-bounds numeric casts. The physical
  QuestionRevision seed insert also requires an explicit NULL ready_at value.
  An isolated local PostgreSQL replay of all migrations plus seed and
  `db:verify-demo` passed; the configured external migration remains pending.

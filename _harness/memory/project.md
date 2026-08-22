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
- AS-03 migration 20260822100000_normalize_assessment_scoring_release was
  applied after explicit backup/rollback approval. AS-09 durable
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
  `db:verify-demo` passed in isolated local PostgreSQL and after configured
  database reset/reseed. The seed now writes runtime scoring/release state,
  typed Tryout run and breakdown fields, and frozen Kuis answer materialization.
  DB-backed Kuis smoke returned a scored/released 67 result; seven-section
  Tryout smoke returned a scored/released 68.68 result with seven runs and
  seven typed breakdowns.

## AS-09 AssessmentRelease boundary

- `20260822120000_add_assessment_release_boundary` was applied after an
  explicit backup/rollback approval. The pre-migration custom-format backup is
  `/tmp/vecalss-as09-pre-migration-20260822.dump`; all 30 migrations now report
  up to date. The configured database was cleanly reset/reseeded afterward
  with the full AssessmentRelease-aware seed.
- Durable release implementation pins published Tryout content, CAT calibration,
  scoring/configuration, media, and logical section identity. Bound runtime paths
  fail closed when frozen metadata or exact source/physical bridges are missing.
- Final adversarial review found no validated P0/P1/P2 findings. Seed locks all
  Tryout session rows before the Tryout aggregate, refuses active release-bound
  physical replacement, and repairs existing runs only after exact bridge and
  frozen-field validation.
- The mentor UI pass adds shared pinned-release notices and human-readable
  ranking/assignment labels in Tryout authoring and operations. TypeScript,
  focused ESLint, full lint (0 errors with existing warnings), diff-check,
  AssessmentRelease/package/release/scoring invariant suites, and production
  build all pass. Student Tryout answer-save state and result ranking/time copy
  were also polished without changing runtime contracts, including the neutral
  training disclaimer `bukan nilai resmi SNBT` and the participant UX contract
  test.
- AS-09 backend and UI are committed as `43dec31` (`feat: pin tryout deliveries
  to assessment releases`). The seed compatibility fix in
  `prisma/seed-assessment.mjs` skips legacy QuestionOption mutations while the
  current revision is Ready/Retired, respecting the new DB guard. DB-backed
  smoke passed: Kuis has 3 scored/released attempts with frozen forms; Tryout
  has 3 scored/released attempts, 21 runs, 21 typed breakdowns, and 7 sections;
  one AssessmentRelease binds 2 sessions, 3 attempts, and 21 runs.
- Browser QA is complete against the migrated seeded database. Mentor Tryout
  catalogue, locked builder, sessions, participants, and participant detail
  passed; student catalogue, waiting room, explicit Start, answer persistence,
  and released result passed. The approved full demo reset/reseed removed the
  temporary QA attempt; the clean fixture has 3 canonical seeded Tryout
  attempts and 0 in-progress attempts.

## AS-04 ParticipantView boundary

- Mentor participant surfaces use a canonical server-only
  `ParticipantView` projection rather than exposing admission and assignment
  mechanics as the primary product model. The projection combines safe
  identity, admission status, current/audit session state, attempt state, and
  score/scoring/release axes; assignment history remains available for audit
  controls.
- Registration, approval, invitation, assignment, and revocation commands in
  `lib/tryout/delivery-repository.ts` share the lock order student →
  admission/assignment → overlapping sessions → Tryout and re-read state after
  the aggregate locks. Open registration assigns the sole eligible default;
  approval/invitation accept a selected session or resolve the default; safe
  matching replays return the existing active assignment before default
  resolution.
- Operations reads are owner-scoped before loading student identities,
  attempts, or release payloads. Mentor DTO serialization masks email fallback
  identities and exposes `participants` while retaining audit assignment rows.
- AS-04 is committed as `ae64528`; it requires no migration. A dedicated
  invitation-picker UI remains deferred because there is no existing mentor
  student-selector surface that invokes the invite action.

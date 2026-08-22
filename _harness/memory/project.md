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

## AS-05 Tryout authoring workspace

- The mentor-facing Tryout authoring surface is one workspace with the stable
  vocabulary `Basics | Sections | Questions | Rules | Schedule & akses |
  Results | Review | Publish`. URL query state is intentionally retained so
  old `authoring`, `policy`, `sessions`, `participants`, and `operations`
  bookmarks continue to resolve during cutover.
- The workspace is a projection layer over the existing Tryout save, release,
  policy, sessions, and ParticipantView contracts. It does not duplicate those
  server boundaries. Review is advisory; publish remains a distinct server
  action and AssessmentRelease is the durable participant-content boundary.
- Package/version stays an internal compatibility bridge behind Questions for
  AS-05. Mentor navigation points to Bank Soal, while direct question picks and
  Set/Pool assembly are explicitly deferred to AS-06.
- Published Tryouts with participant history remain read-only in place and
  offer duplication. Participant preview is read-only and states that it does
  not create attempts, admission, or sessions.
- AS-05 is committed as `1ea7b3d`, tablet containment as `c22ecb2`, finish-review
  fixes as `17a9d53`, the no-argument draft-save regression guard as
  `a1bca11`, and the shell landmark composition contract as `72b95e9`; it
  requires no migration. Ordinary Save
  explicitly stays draft, Schedule & akses remains mounted across tabs, and
  Review/Publish gates content/media/duplicate/CAT/duration/schedule readiness
  before the server publish action. Focused contract, full repository
  verification, Impeccable detector, and authenticated 390/900px browser QA
  pass. The fresh final review against `72b95e9` passed; its artifact is
  `reviews/as05-tryout-authoring-workspace-final-72b95e9-review-20260822`.

## AS-06 random assembly schema boundary

- Pool-first authoring was approved after the side-effect-free UI/mock gate;
  the schema ticket is committed as `4f2dbd0`.
- `ReusableQuestionPackageMode` supports `fixed_set`, `random_pool`,
  `blueprint`, and `cat_pool`. Existing package/version rows remain fixed Sets;
  legacy version provenance is derived from source revision identity/digest
  proof rather than upgraded unconditionally.
- Version-owned Bank/folder/category scope rows and one exact quota rule row
  define non-fixed revisions. Fixed Sets retain their existing item snapshots
  and compatibility source-Bank projection; Blueprint does not require item
  membership at schema level.
- Ready transition triggers fill the compatible Subtest and stable definition
  digest for the existing fixed-Set writer, enforce package/version mode at the
  Ready boundary, and extend child immutability to both old and new parents.
- AssessmentRelease assembly metadata is tied to a published version and
  checks mode-specific Pool/Blueprint/CAT seed, candidate, resolution, quota,
  scope, and calibration presence/cardinality. Direct releases remain the
  nullable no-assembly path.
- Migration validation uses isolated local PostgreSQL only. The opt-in DB
  contract is `pnpm test:random-assembly-schema-db` with
  `RANDOM_ASSEMBLY_SCHEMA_TEST_DATABASE_URL`; it rejects the configured
  `DATABASE_URL`. The configured database has not received migration 31.
- Ticket 3 owns repository commands, creator/shared-read authorization, Ready
  revision creation, and read-only preview; resolver/release integration is
  later work.

## AS-06 assembly repository and preview boundary

- Ticket 3 is committed as `9a1e306` (`feat: add random assembly repository
  workflow`). `lib/tryout/assembly-repository.ts` is server-only and owns
  package aggregate locking, mutable named drafts, immutable Ready revision
  snapshots, shared Ready reads, readiness reports, and temporary-seed
  previews. `lib/tryout/assembly-validation.ts` contains pure shape/quota/error
  and deterministic seeded-shuffle helpers; mentor server actions live in
  `modules/mentor/assembly-actions.ts`.
- Draft candidate membership remains in `ReusableQuestionPackageItem`; the
  current draft version owns normalized Bank/folder/category scopes and one
  mode-specific rule. Ready Pool/CAT/fixed definitions snapshot candidate
  content/options into version items. Ready Blueprint definitions freeze only
  scope and quotas, leaving final question resolution to AssessmentRelease.
- Mutations require the package creator or admin; published Ready list/detail
  and preview are shared through the Kapten capability action boundary. The
  existing Tryout package binding path now reads published Ready versions as
  shared assets instead of filtering them by creator.
- Repository validation is fail-closed for stale QuestionRevision/digest,
  duplicate identity, wrong/inactive Subtest, archived/inactive Bank, invalid
  options, missing explanation, unready media, quota/scope/shortage, and CAT
  canonical `2pl-canonical-v1` calibration mismatch. Errors expose stable codes
  and details to Review/server-action consumers.
- Preview is read-only and returns a generated temporary seed, illustrative
  sample, availability counts, and blockers; it does not create versions,
  physical items, releases, delivery sessions, attempts, or CAT runs.
- `pnpm test:random-assembly-repository`, related AS-06/AS-05 regression
  contracts, TypeScript, focused ESLint, diff-check, and `pnpm verify` pass.
  Migration 31 remains unapplied to the configured database; only isolated
  disposable PostgreSQL replay/DB contracts may exercise the schema migration.

## AS-06 seeded Pool and Blueprint release boundary

- Ticket 4 is complete in `5311eda` with the Blueprint publish/idempotency
  correction in `2e0915c`.
- `lib/tryout/assessment-release.ts` resolves random Pool and Blueprint forms
  only while creating an AssessmentRelease. The lock order is Tryout aggregate
  → sorted Ready assembly versions → sorted Question/Bank/current Revision
  source rows. Resolution is server-authoritative and no database `random()` is
  used.
- Pool uses explicit Ready version item membership, validates every candidate's
  live source identity/provenance/readiness, fails on any stale candidate or
  shortage, then applies `seeded-fisher-yates-v1` without replacement. Blueprint
  uses current Ready questions in the immutable normalized scope and active
  Section Subtest, then draws exact Easy/Medium/Hard quotas with no fallback.
- The release payload stores per-section assembly mode/package/version,
  resolver, seed, requested/candidate/availability evidence, quotas/scope,
  resolved source IDs, and revision digests. Physical TryoutItem and option
  bridge rows are replaced atomically only when no active release-bound session
  would be invalidated. Blueprint Ready versions are scope/quota-only and are
  allowed through publish so this transaction creates their bridge.
- Same explicit publication intent keys derive the same seed and canonical
  digest. Delivery/open/retake callers without a key reuse the pinned release
  for the same Tryout revision; authoring saves increment the revision, and a
  new explicit key represents a new publication intent.
- Verification and final review PASS are recorded in
  `artifacts/reviews/as06-pool-blueprint-release-resolution-final-review-20260822`.
  Migration 31 remains unapplied to the configured database.

## AS-06 CAT Pool release boundary

- Ticket 5 is complete in `347cc37` with contract coverage in `e4bb17c` and
  the mixed-mode release fix in `1ef8e85`.
- CAT Pool publish locks the aggregate, Ready version, Question/Bank/current
  Revision/Subtest sources, and canonical calibration rows in deterministic
  order. Every explicit candidate is revalidated for Ready identity/digest,
  active scope, content/options/media, provenance, approved
  `2pl-canonical-v1`, and finite positive discrimination; candidate count must
  be at least the delivered count, with exact-size pools accepted.
- The AssessmentRelease payload owns every CAT candidate snapshot and full
  calibration metadata (calibration ID/digest, source revision identity and
  provenance, approval state, model version, difficulty/discrimination, and
  resolver version). Runtime CAT selection reads only those pinned parameters;
  existing tie-break, no-back-navigation, no-CBT-fallback, and acknowledged
  answer preservation behavior remain unchanged.
- Calibration/source drift blocks new releases without mutating old releases.
  Mixed CAT Pool plus direct-CAT Tryouts revalidate only the unpinned/direct
  CAT sections before reusing an existing CAT Pool release.
- Focused CAT/random/repository/schema/direct/package/release contracts,
  TypeScript, focused ESLint, diff-check, and `pnpm verify` pass. The broad
  AssessmentRelease invariant is currently blocked by unrelated dirty
  admin-preview edits; migration 31 remains unapplied and no live DB
  concurrency test was run. Review artifact:
  `artifacts/reviews/as06-cat-pool-release-pinning-fresh-review-20260822`.

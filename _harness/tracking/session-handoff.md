# Session Handoff

## Current AS-05 Handoff (2026-08-22)

- Objective: turn `/mentor/tryout` into one mentor-facing Tryout authoring
  workspace with Basics, Sections, Questions, Rules, Schedule & akses, Results,
  Review, and Publish areas.
- Implementation commit: `1ea7b3d` (`feat: consolidate tryout authoring
  workspace`). No schema or migration change was needed; all 30 migrations are
  applied.
- Builder behavior: the workspace keeps the seven fixed subject sections,
  CBT/CAT constraints, local draft state while switching tabs, the durable
  AssessmentRelease notice, explicit draft save versus publish, locked release
  behavior, and a read-only participant preview.
- Transitional boundary: existing package/version data remains an internal
  source bridge in Questions, but the workspace does not send mentors to the
  Package route. Direct question picks and Set/Pool assembly are deferred to
  AS-06.
- Embedded projections: Schedule & akses reuses the current policy, sessions,
  and ParticipantView operations modules; Results projects session/attempt
  state and links to existing detail routes; Review shows client-side
  readiness while publish remains server-validated.
- Compatibility: the dynamic Tryout route preserves legacy `authoring`,
  `policy`, `sessions`, `participants`, and `operations` query values while
  adopting the eight-area vocabulary.
- Verification: `pnpm test:tryout-authoring-workspace`, TypeScript,
  `git diff --check`, focused ESLint, full `pnpm verify`, and the Impeccable
  detector passed. Authenticated ego-browser QA passed on desktop and mobile:
  all tabs, query persistence, draft switching, preview copy, seven subjects,
  CAT rules, release notice, locked published Tryout, and no 390px body
  overflow.
- Recommended pickup: review the AS-05 changeset, then start AS-06 (direct
  question picks and optional Set/Pool assembly). Keep the existing
  `/tmp/vecalss-as09-pre-migration-20260822.dump` available for rollback
  investigation and do not reset/reseed without explicit approval.

## Current AS-04 Handoff (2026-08-22)

- Objective: expose one mentor-facing ParticipantView while keeping admission
  and assignment audit rows intact, and make registration/approval/invitation/
  assignment/revocation transitions atomic and replay-safe.
- Implementation commit: `ae64528` (`feat: add participant view access
  transitions`). No schema or migration change was needed; all 30 migrations
  are applied and `pnpm exec prisma migrate status` reports the database is up
  to date.
- Canonical projection: `lib/tryout/participant-view.ts` combines admission,
  safe identity, current/audit sessions, attempt, score, scoring, and release
  state. Email fallback is masked and raw email is not serialized into mentor
  DTOs.
- Atomic commands: `lib/tryout/delivery-repository.ts` now uses the shared
  student → admission/assignment → overlapping-session → Tryout lock order,
  re-reads after aggregate locks, checks Tryout ownership before PII-bearing
  graph loads, and preserves historical assignments on revoke. Open
  registration assigns the sole eligible default; approval and invitation can
  use a selected session or the default; matching replays short-circuit before
  default resolution.
- UI/API: operations serialization exposes `participants`; mentor list/detail
  pages show one participant summary while retaining audit assignment controls;
  `selectedSessionId` is threaded through approval/invitation actions. No
  existing mentor surface invokes invitation or has the required student
  selector, so a dedicated invite-picker UI remains a follow-up rather than an
  unimplemented server invariant.
- Verification: AS-04 ParticipantView contract, participant UX contract,
  AssessmentRelease/package/release/scoring invariants, Tryout scoring,
  TypeScript, full lint (0 errors; 459 baseline warnings), production build,
  Prisma migration status, and diff-check all passed. Manual review artifact:
  `artifacts/reviews/as04-participant-view-review/index.md`.
- Recommended pickup: review the changeset, then start AS-05 (one Tryout
  authoring workspace) unless the invite-picker is prioritized first.

## Current AS-09 Deployment Handoff (2026-08-22)

- Objective: deploy and verify the durable AssessmentRelease boundary for Tryout deliveries, then preserve the UI/runtime handoff for the next session.
- Workspace: `main` at `43dec31` (`feat: pin tryout deliveries to assessment releases`) plus the seed compatibility fix recorded below. The configured database was backed up before deployment at `/tmp/vecalss-as09-pre-migration-20260822.dump` (861 KB, pg_dump custom format).
- Migration `20260822120000_add_assessment_release_boundary` was applied successfully with `pnpm exec prisma migrate deploy`, and a clean reset/reseed subsequently replayed all 30 migrations. `prisma migrate status` reports the database schema is up to date.
- Seed/runtime verification: `pnpm db:verify-demo` passes with 21 questions, 7 quizzes, 7 package versions, 7 Tryout sections, 6 participant states, and 3 released attempts. DB-backed Kuis smoke has 3 scored/released attempts and 3 frozen forms. DB-backed Tryout smoke has 3 scored/released attempts, 21 runs, 21 typed breakdowns, and 7 sections; one AssessmentRelease is bound to 2 sessions, 3 attempts, and 21 runs. AssessmentRelease invariants and Prisma schema validation pass.
- Seed fix: `prisma/seed-assessment.mjs` now skips legacy `question_options` mutations when the current physical QuestionRevision is Ready/Retired, so reruns respect the database immutability guard. Clean reset/reseed remains the supported path when an active release-bound session prevents physical Tryout replacement.
- UI/runtime status: AS-09 mentor release notices and student answer-save/result-state polish are committed and verified. Authenticated browser QA now passes against the migrated seeded database.
- Browser QA coverage: mentor Tryout catalogue, locked builder, sessions, participants, and participant detail; student catalogue, waiting room, explicit Start, first section, answer persistence (`Jawaban tersimpan`), and released result.
- The QA attempt `0c4472b5-c1d7-4a89-86b6-cc008251228c` was removed by the explicitly approved full demo reset/reseed. The clean fixture now has 3 canonical seeded Tryout attempts, 0 in-progress attempts, and no matching QA attempt. The pre-migration dump remains available for rollback investigation.
- No application code or migration files changed during cleanup; the dev server and browser task space were closed after QA.

## Historical AS-03 Pickup (2026-08-22)

- Objective: preserve the completed AS-03 normalized Attempt/Scoring/Release
  states for canonical StandaloneQuiz and Tryout only; do not start AS-09.
- Workspace: main with AS-03 implementation `cb1eb8f` and hardening `7f60c43`,
  plus the durable handoff docs in this file. Unrelated preview/harness/
  document changes are present; preserve them. All AS-03 paths are committed
  by explicit pathspec.
- AS-03 migration:
  `prisma/migrations/20260822100000_normalize_assessment_scoring_release/migration.sql`
  was applied to the configured external database after backup/rollback approval.
  The unrelated admin-preview migration was also applied during the approved
  full reset/reseed.
- Runtime hardening completed:
  - Tryout run snapshots now include explanation text and explanationAssetId.
  - Final seven-run sealing calls materializeTryoutAttemptInTransaction inside
    the existing transaction; repeated calculation upserts one breakdown per
    subtest and preserves expired/auto-submitted state.
  - Canonical seven-run checks bind each run to this Tryout's section ID and
    sequence; abandoned/void/in-progress attempts cannot be calculated or
    released.
  - Release readiness requires scored materialized runs, seven breakdowns,
    complete text-or-asset explanations, and rankingRule other than none.
  - Mentor result mutations enforce Tryout ownership in the repository;
    admins receive an explicit cross-owner exception from the server action.
  - Student Tryout results read only frozen snapshot content and materialized
    answer/run/breakdown fields.
  - Kuis scheduled release transitions are locked and student-scoped before
    result reads; due results cannot remain persisted as scheduled forever.
  - Tryout automatic/scheduled/immediate release is synchronized at the locked
    delivery-session boundary, with one stable release timestamp and ranking
    only over the released bundle; CAT retry/void commands enforce owner-or-
    admin authorization inside their transactions.
  - A valid run that expires at its own server deadline still triggers final
    seven-run aggregation; failed/ambiguous expiration remains review-required.
- Migration hardening completed:
  - guarded boolean/numeric JSON casts quarantine malformed rows;
  - canonical seven-section/run identity and explanation checks gate legacy
    scoring;
  - malformed snapshot arrays and invalid CAT selected IDs are quarantined;
  - seven distinct subject sections are required before a legacy aggregate is
    considered provable;
  - typed Tryout breakdowns are inserted idempotently before release state is
    preserved; existing legacy rows are updated from canonical runs and
    release readiness requires canonical subtests plus typed numeric fields;
  - legacy run JSON is accepted only for known runtime versions and is checked
    against frozen-answer counts, snapshot points, CAT ability, and normalized
    score math; duplicate/foreign CAT selections and answer rows are
    quarantined; raw-score aggregation matches runtime sum semantics;
  - numeric casts are range-bounded and legacy release state requires scoring,
    seven typed canonical breakdowns, and a non-none ranking rule.
- Post-fix review: `reviews/as03-scoring-release-postfix-review` found six
  P1/P2 boundary issues; all are addressed in the follow-up changes below.
- Verification passing: Prisma generate/validate, tsc, focused ESLint, AS-03
  invariants, Tryout scoring/release/package invariants, full lint/build, the
  complete 29-migration replay in an isolated local PostgreSQL instance, and
  seeded `pnpm db:verify-demo` against that local instance. Full lint has 0
  errors and 459 existing warnings. The seed SQL arity defect in the physical
  QuestionRevision insert was also fixed and the seed replay now passes.
- AS-03 implementation commit: `cb1eb8f` (`fix: normalize assessment scoring
  and release states`); follow-up hardening is `7f60c43` (`fix: close AS-03
  release boundaries`). The approved migration was executed transactionally
  and registered as applied; `prisma migrate status` now reports only the
  unrelated admin-preview migration as pending.
- Deployment verification: all 29 migrations report up to date. The entire
  configured database was intentionally reset and reseeded after approval,
  with fresh runtime provenance in the assessment seed. `pnpm db:verify-demo`
  passes. The Kuis result path returned a scored/released attempt (67, three
  frozen questions), and the Tryout result path returned a scored/released
  attempt (68.68, seven runs, seven typed breakdowns).
- Next actions: continue normal assessment QA, then implement AS-09's durable
  AssessmentRelease pin when the release-boundary smoke remains satisfactory.

## Current Objective

- Goal: Implement the approved admin student-preview route family.
- Current status: Feature implementation and repository verification complete.
- Branch / commit: `main` / `c46fb98` (`feat: complete admin student preview surfaces`)

## Completed This Session

- [x] Fixed managed preview fixture, server-side actor/subject separation, and system-wide isolation guards.
- [x] Added read-only Beranda/Materi/Kuis/Tryout routes with explicit safe DTOs and no-store boundaries.
- [x] Added Tryout restart persistence with advisory locks, request-ID idempotency, expected-current checks, superseded history, and no learner hooks.
- [x] Added CodeMirror banner editing scoped to preview with draft/published cache separation.
- [x] Added focused contract tests and production verification.

## Verification Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| Preview contracts | `pnpm test:admin-student-preview-banners` / `quiz` / `tryout` | PASS | Focused security and lifecycle assertions. |
| Surface contract | `pnpm exec tsx scripts/test-admin-student-preview-surfaces.ts` | PASS | Route, content, and forbidden-effect assertions. |
| Typecheck | `pnpm exec tsc --noEmit --pretty false` | PASS | Full repository typecheck. |
| Lint/build | `pnpm verify` | PASS | 0 errors; 459 known baseline warnings; production build passed. |
| Runtime fixture | Seeded browser/DB E2E | PENDING | No local authenticated fixture harness available. |

## Files Changed

- `app/admin/student-preview/[[...slug]]/page.tsx`
- `lib/admin/student-preview-quiz-reads.ts`
- `lib/admin/student-preview-tryout.ts`
- `lib/student/banner-repository.ts`
- `modules/admin/student-banners-actions.ts`
- `modules/student/components/admin-student-preview-surfaces.tsx`

## Decisions Made

- Keep the admin session as actor and resolve one fixed managed student fixture as subject.
- Use dedicated preview read entry points and explicit DTO allowlists; never pass an `adminPreview` bypass flag through learner services.
- Treat preview restarts as an explicit mutation with a transaction-scoped student/Tryout lock plus a request-ID lock and unique idempotency record.
- Keep preview draft/banner cache entries isolated from ordinary published student rendering.

## Blockers / Risks

- Browser and allowlisted DB/event diff checks need a seeded authenticated runtime fixture.
- Unrelated assessment-scoring changes and documentation deletions remain outside the preview commit.

## Next Session Startup

1. Read `AGENTS.md` → follow harness routing.
2. Read `_harness/tracking/feature_list.json` and `_harness/tracking/progress.md`.
3. Review this handoff.
4. Run `./init.sh` or follow `_harness/workflow.md` § Session start.

## Recommended Next Step

- Run browser QA and the allowlisted DB/event side-effect test with the seeded fixture; then review the changeset walkthrough.

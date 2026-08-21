# Session Handoff

## Current AS-03 Pickup (2026-08-22)

- Objective: preserve the completed AS-03 normalized Attempt/Scoring/Release
  states for canonical StandaloneQuiz and Tryout only; do not start AS-09.
- Workspace: main with AS-03 implementation `cb1eb8f` and hardening `7f60c43`,
  plus the durable handoff docs in this file. Unrelated preview/harness/
  document changes are present; preserve them. All AS-03 paths are committed
  by explicit pathspec.
- AS-03 migration:
  `prisma/migrations/20260822100000_normalize_assessment_scoring_release/migration.sql`
  was applied to the configured external database after backup/rollback approval.
  The unrelated admin-preview migration remains pending.
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
- Next actions: run DB-backed Kuis and seven-section Tryout smoke tests against
  the deployment target, then continue with AS-09 when the release-boundary
  smoke is satisfactory.

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

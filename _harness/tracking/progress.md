# Session Progress Log

## Current State

**Last Updated:** 2026-08-22
**Session ID:** assessment-as03
**Active Feature:** AS-03 normalized scoring and result release states

## Status

### What's Done

- [x] Fixed server-resolved preview fixture and admin actor/subject boundary.
- [x] Added read-only Beranda, Materi, Kuis, and Tryout preview surfaces.
- [x] Added guarded Tryout preview restart with idempotency, locking, and history.
- [x] Added CodeMirror banner editing with draft/published cache separation.
- [x] Added preview route/content-security contracts and system-wide fixture guards.

### What's In Progress

- [x] AS-03 normalized scoring and release states
  - Runtime: Kuis materialization and Tryout CBT/CAT scoring are snapshot-backed;
    Tryout final-run sealing now performs transaction-local seven-run aggregation.
  - Migration: 20260822100000_normalize_assessment_scoring_release is applied
    after backup/rollback approval. It quarantines malformed/contradictory
    legacy JSON, proves canonical
    seven-section runs and frozen CAT selections, updates existing typed
    breakdown rows idempotently, and withholds incomplete/rankingless releases.
  - Follow-up hardening closes per-run deadline aggregation, session-level
    release/ranking consistency, CAT owner authorization, numeric range guards,
    and the QuestionRevision seed insert arity defect.
  - Implementation is `cb1eb8f` plus hardening `7f60c43`; isolated local and
    configured-database migration replay, seed, and `pnpm db:verify-demo` pass.
    The entire configured database was reset/reseeded after approval. Kuis DB
    result smoke passes at 67; Tryout DB release smoke passes at 68.68 with
    seven runs and seven typed breakdowns.
- [ ] Runtime browser/DB fixture verification for admin preview
  - Details: Requires a seeded authenticated admin session and preview fixture.
  - Blockers: No local E2E/DB fixture harness is available in this workspace.

### What's Next

1. Run seeded browser QA for each preview surface and banner save flow.
2. Run the allowlisted database/event diff around ordinary browsing and restart.
3. Continue assessment QA and then implement AS-09 durable AssessmentRelease
   pins.

## Blockers / Risks

- [x] Runtime verification fixture: all 29 migrations, full seed, `db:verify-demo`, Kuis result smoke, and seven-section Tryout scoring/release smoke pass against the configured database.
- [ ] Preview content is treated as untrusted and sanitized/allowlisted before admin-context rendering.

## Decisions Made

- **Fixed subject, separate actor**: Admin preview resolves one managed fixture server-side and never impersonates or accepts an arbitrary student ID.
  - Context: Keeps audit attribution and prevents learner-state mutation.
  - Alternatives considered: Student-session impersonation and caller-selected student IDs were rejected.
- **Dedicated preview reads**: Preview loaders use explicit DTOs and a forbidden-effects boundary rather than learner loaders with bypass flags.
  - Context: Prevents cache, answer-key, and side-effect leakage.
  - Alternatives considered: Generic `adminPreview` service booleans were rejected.

## Files Modified This Session

- `app/admin/student-preview/[[...slug]]/page.tsx` - Dynamic preview route for all student-shaped surfaces.
- `lib/admin/student-preview-tryout.ts` - Locked, idempotent preview restart service.
- `lib/admin/student-preview-quiz-reads.ts` - Student-safe quiz DTO/read path.
- `lib/student/banner-repository.ts` - Published/admin-preview/draft no-store loaders.
- `modules/admin/student-banners-actions.ts` - Preview-scoped banner mutation.

## Evidence of Completion

- [x] Tests pass: `pnpm test:admin-student-preview-banners`, `pnpm test:admin-student-preview-quiz`, `pnpm test:admin-student-preview-tryout`, and surface contract checks.
- [x] Type check clean: `pnpm exec tsc --noEmit --pretty false`.
- [x] Repository verification: `pnpm verify` passed through commit hook; lint has 459 known warnings and 0 errors, and production build passed.
- [ ] Manual verification: browser/DB fixture checks pending.

## Notes for Next Session

Preview implementation committed as `c46fb98`; AS-03 implementation is `cb1eb8f` with hardening `7f60c43`, and all migrations are applied. The configured database was intentionally reset/reseeded after explicit approval; preserve unrelated preview/harness/document history. Use a seeded admin session before attempting browser mutation-diff verification; do not reset or seed production-like data again without explicit approval.

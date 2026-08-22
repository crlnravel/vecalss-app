# Session Progress Log

## Current State

**Last Updated:** 2026-08-22
**Session ID:** assessment-as05-authoring-workspace
**Active Feature:** AS-05 one Tryout authoring workspace

## Status

### What's Done

- [x] AS-05 one Tryout authoring workspace (`1ea7b3d`)
  - Reframed the mentor Tryout builder as one eight-area workspace:
    Basics, Sections, Questions, Rules, Schedule & akses, Results, Review,
    and Publish.
  - Preserved the seven fixed subject sections, CBT/CAT rules, existing
    draft/save action, durable AssessmentRelease notice, and locked published
    Tryout behavior.
  - Kept package/version as an internal source bridge behind Questions while
    directing mentors to Bank Soal; direct picks and Set/Pool assembly remain
    AS-06.
  - Embedded schedule/access operations and results projections in the same
    workspace, with compatibility mapping for bookmarked legacy query values.
  - Added the focused `test:tryout-authoring-workspace` contract.

- [x] AS-04 ParticipantView and atomic access transitions (`ae64528`)
  - Added a server-only ParticipantView combining admission, current/audit
    session, attempt, score, scoring, and release state without removing the
    underlying assignment/audit rows.
  - Open registration now assigns one validated default session atomically;
    approval and invitation assign a selected/default session in the same
    transaction; assignment and revocation preserve history.
  - Access commands use deterministic student → admission/assignment →
    overlapping-session → Tryout locks, post-lock re-reads, ownership checks,
    and safe idempotent replay behavior.
  - Mentor operations and participant pages consume the shared projection with
    masked identity fallback and Indonesian session/attempt/release labels.
  - No schema migration was needed; the database remains at all 30 applied
    migrations.

- [x] AS-09 durable AssessmentRelease deployment and verification
  - `20260822120000_add_assessment_release_boundary` applied successfully after
    a custom-format backup at
    `/tmp/vecalss-as09-pre-migration-20260822.dump`.
  - Clean reset/reseed replayed all 30 migrations and created coherent pinned
    Tryout sessions, attempts, runs, and CAT snapshots.
  - `pnpm db:verify-demo` passes. DB smoke confirms 3 scored/released Kuis
    attempts with frozen forms and 3 scored/released Tryout attempts with 21
    runs, 21 typed breakdowns, and 7 sections.
  - Seed compatibility fix skips immutable legacy QuestionOption mutations for
    Ready/Retired current revisions; AssessmentRelease invariants and Prisma
    validation pass.

- [x] Fixed server-resolved preview fixture and admin actor/subject boundary.
- [x] Added read-only Beranda, Materi, Kuis, and Tryout preview surfaces.
- [x] Added guarded Tryout preview restart with idempotency, locking, and history.
- [x] Added CodeMirror banner editing with draft/published cache separation.
- [x] Added preview route/content-security contracts and system-wide fixture guards.

### What's In Progress

- [ ] Dedicated invitation-picker UI
  - The server action now accepts a selected session and atomically assigns it,
    but no existing mentor surface currently invokes the invitation action or
    provides the required student selector. This remains a separate UI slice,
    not a missing AS-04 server invariant.

### What's Next

1. Review the AS-05 changeset and finish any material review findings.
2. Start AS-06: direct question picks and optional Set/Pool assembly UX.
3. Keep the pre-migration dump available for rollback investigation; do not
   reset or reseed the configured database without explicit approval.

### AS-09 Browser QA

- [x] Authenticated mentor Tryout QA: catalogue, locked builder, sessions,
  participants, and participant detail all rendered with HTTP 200.
- [x] Authenticated student Tryout QA: catalogue, waiting room, explicit Start,
  first section, answer persistence status, and released result all passed.
- [x] Fixture cleanup: the approved full demo reset/reseed removed QA attempt
`0c4472b5-c1d7-4a89-86b6-cc008251228c`; verification confirms 3 canonical
seeded Tryout attempts and 0 in-progress attempts.

### AS-05 Browser QA

- [x] Authenticated mentor Tryout workspace rendered on desktop and mobile.
- [x] All eight tabs are present; direct `?workspace=` navigation and reload
  preserve the selected area.
- [x] Draft title state survives Basics → Sections → Basics without a save.
- [x] Participant preview opens as a read-only dialog and states that it does
  not create an attempt, admission, or session.
- [x] Seven fixed subject sections, source readiness, CAT rules, release notice,
  and locked published behavior are visible in the workspace.
- [x] Mobile layout has no horizontal body overflow (`390px` viewport).

## Blockers / Risks

- [x] Runtime verification fixture: all 29 migrations, full seed, `db:verify-demo`, Kuis result smoke, and seven-section Tryout scoring/release smoke pass against the configured database.
- [x] Preview content is treated as untrusted and sanitized/allowlisted before admin-context rendering.

## Decisions Made

- **Fixed subject, separate actor**: Admin preview resolves one managed fixture server-side and never impersonates or accepts an arbitrary student ID.
  - Context: Keeps audit attribution and prevents learner-state mutation.
  - Alternatives considered: Student-session impersonation and caller-selected student IDs were rejected.
- **Dedicated preview reads**: Preview loaders use explicit DTOs and a forbidden-effects boundary rather than learner loaders with bypass flags.
  - Context: Prevents cache, answer-key, and side-effect leakage.
  - Alternatives considered: Generic `adminPreview` service booleans were rejected.
- **ParticipantView hides mechanics, not history**: Mentor participant surfaces use one projection while admission and assignment audit rows remain separately queryable.
  - Context: Keeps the operational mental model simple without weakening revocation, replay, or audit guarantees.
  - Alternatives considered: Collapsing admission and assignment tables was rejected.
- **Access transitions share one lock order**: Student → admission/assignment → overlapping sessions → Tryout, followed by post-lock re-reads.
  - Context: Serializes registration, approval, invitation, assignment, revoke, and participant start races.
  - Alternatives considered: Per-command lock orders were rejected because they can deadlock or lose access transitions.

## Files Modified This Session

- `modules/mentor/KaptenTryoutBuilderPageModule.tsx` - Eight-area workspace
  projections, tab persistence, preview, release/publish boundary, and locked
  state.
- `app/mentor/tryout/[tryoutId]/page.tsx` - Preserve workspace query values on
  reload.
- `scripts/test-tryout-authoring-workspace.ts` - Focused AS-05 contract checks.
- `package.json` - Focused AS-05 test script.

- `lib/tryout/participant-view.ts` - Canonical mentor participant projection.
- `lib/tryout/delivery-repository.ts` - Atomic admission, assignment, and revoke transitions.
- `lib/tryout/operations-view.ts` - Owner-scoped operations serialization.
- `modules/mentor/KaptenTryoutParticipantsPageModule.tsx` - Participant list projection.
- `modules/mentor/KaptenTryoutParticipantDetailPageModule.tsx` - Summary and session selection controls.
- `scripts/test-assessment-participant-view.ts` - AS-04 contract coverage.

## Evidence of Completion

- [x] AS-05 contract: `pnpm test:tryout-authoring-workspace`.
- [x] Type check: `pnpm exec tsc --noEmit --pretty false`.
- [x] Diff check: `git diff --check`.
- [x] Full verification: `pnpm verify` passed through the AS-05 commit hook;
  lint has 0 errors and 459 baseline warnings, and production build passed.
- [x] Impeccable deterministic detector: no findings (`[]`).
- [x] Authenticated ego-browser desktop/mobile QA and interaction checks.
- [x] Tests pass: `pnpm test:assessment-participant-view`, participant UX, AssessmentRelease/package/release/scoring invariants, and Tryout scoring contract.
- [x] Type check clean: `pnpm exec tsc --noEmit --pretty false`.
- [x] Repository verification: `pnpm verify` passed through the AS-04 commit hook; lint has 459 known warnings and 0 errors, and production build passed.
- [x] Prisma migration status: all 30 migrations are applied; AS-04 required no schema change.
- [x] Manual code review: no blocking findings; review artifact recorded under `reviews/as04-participant-view-review`.

## Notes for Next Session

AS-05 implementation is committed as `1ea7b3d` (`feat: consolidate tryout
authoring workspace`). AS-04 remains `ae64528`; AS-03 is `cb1eb8f` with
hardening `7f60c43`; AS-09 backend/UI is `43dec31` plus the seed compatibility
fix. All 30 migrations are applied and the configured database was intentionally
reset/reseeded after explicit approval; preserve unrelated preview/harness/
document history. AS-05 introduces no migration and no DB mutation smoke is
needed beyond the existing release/runtime evidence; its new behavior is
covered by focused contracts, full verification, and authenticated browser QA.

# Session Progress Log

## Current State

**Last Updated:** 2026-08-22
**Session ID:** assessment-as04-participant-view
**Active Feature:** AS-04 ParticipantView and atomic access transitions

## Status

### What's Done

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

1. Review the AS-04 changeset and, if desired, add the invitation-picker UI.
2. Start AS-05: one Tryout authoring workspace.
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

- `lib/tryout/participant-view.ts` - Canonical mentor participant projection.
- `lib/tryout/delivery-repository.ts` - Atomic admission, assignment, and revoke transitions.
- `lib/tryout/operations-view.ts` - Owner-scoped operations serialization.
- `modules/mentor/KaptenTryoutParticipantsPageModule.tsx` - Participant list projection.
- `modules/mentor/KaptenTryoutParticipantDetailPageModule.tsx` - Summary and session selection controls.
- `scripts/test-assessment-participant-view.ts` - AS-04 contract coverage.

## Evidence of Completion

- [x] Tests pass: `pnpm test:assessment-participant-view`, participant UX, AssessmentRelease/package/release/scoring invariants, and Tryout scoring contract.
- [x] Type check clean: `pnpm exec tsc --noEmit --pretty false`.
- [x] Repository verification: `pnpm verify` passed through the AS-04 commit hook; lint has 459 known warnings and 0 errors, and production build passed.
- [x] Prisma migration status: all 30 migrations are applied; AS-04 required no schema change.
- [x] Manual code review: no blocking findings; review artifact recorded under `reviews/as04-participant-view-review`.

## Notes for Next Session

AS-04 implementation is committed as `ae64528` (`feat: add participant view access transitions`). AS-03 is `cb1eb8f` with hardening `7f60c43`; AS-09 backend/UI is `43dec31` plus the seed compatibility fix. All 30 migrations are applied and the configured database was intentionally reset/reseeded after explicit approval; preserve unrelated preview/harness/document history. No AS-04 DB mutation smoke was run because the implementation was verified through contracts/build and no new migration was required.

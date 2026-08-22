# Session Progress Log

## Current State

**Last Updated:** 2026-08-22
**Session ID:** assessment-as06-direct-question-picks
**Active Feature:** AS-06 random Pool/Blueprint/CAT assembly decisions

## Status

### What's Done

- [x] AS-06 direct question picks and optional Set assembly UX
  - Added inline Questions modes for direct Ready-question picks and existing
    immutable fixed Sets; random Pool/Blueprint/CAT authoring is a separate
    follow-up and is now covered by the approved planning artifacts below.
  - Direct browsing filters any non-archived Bank Soal by the active Section
    subject, supports search/pagination, cross-bank selection, ordering, and
    removal, and keeps source readiness visible in the authoring Review.
  - Direct saves lock and re-read Question/Bank rows, reject stale revision IDs
    or content digests; both source identity fields are required. Wrong
    Subtests, invalid options/media, archived sources, and duplicate sources
    are rejected before immutable TryoutItem snapshots are created.
  - Publish adds explanation/media readiness and direct CAT requires canonical
    approved 2PL calibration; no schema migration was needed.
  - Follow-up `61abfbb` closes the post-publish delivery boundary: AssessmentRelease
    eligibility now accepts direct physical snapshots, validates their provenance
    and Subtest, and applies the canonical CAT check to direct items as well.
    Missing direct source digests are rejected at the save boundary.
  - Added `test:tryout-direct-question-picks`; focused contracts, TypeScript,
    focused ESLint, full `pnpm verify`, diff-check, and Impeccable detector
    passed.

- [x] AS-06 random Pool/Blueprint/CAT assembly decisions
  - Settled Pool resolution at AssessmentRelease creation, explicit candidate
    membership, preview-only sampling, and system-generated persisted seeds.
  - Settled one-Section/one-Subtest Blueprints with selected-Bank union,
    optional folder/category narrowing, exact Easy/Medium/Hard quotas, and
    fail-closed shortage reports.
  - Settled explicit calibrated CAT candidates, canonical 2PL pinning, and
    candidate count at least the delivered count; CAT remains Tryout-only.
  - Settled named drafts plus immutable Ready revisions, shared-read/creator-
    edit access, and AssessmentRelease-owned resolution/provenance snapshots.
  - Core flow: `artifacts/as06-random-assembly-core-flow`.
  - Technical plan: `artifacts/as06-random-assembly-technical-plan`.
  - Pool-first mock flow was approved and implemented in `8deaad7`; schema
    Ticket 2 is now complete in `4f2dbd0` with no configured-database deploy.
  - The forward migration adds mode/provenance metadata, version-owned scope
    and rule tables, AssessmentRelease assembly provenance, Ready transition
    metadata, and database immutability/readiness guards.
  - The migration replays cleanly through all 31 migrations on an isolated
    local PostgreSQL instance; legacy provenance is derived conservatively and
    existing fixed Sets remain the compatibility path.

- [x] AS-05 one Tryout authoring workspace (`1ea7b3d`, `c22ecb2`, `17a9d53`, `a1bca11`, `72b95e9`)
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
  - Closed the finish-review findings: draft save cannot republish, Schedule &
    akses stays mounted, Review/Publish covers content/media/duplicate/CAT/
    duration/schedule invariants, embedded landmarks and section-button
    semantics are valid, historical releases are labeled, and the tablet/mobile
    tab rail is bounded with a scroll cue.
  - Kept the route content as a `div` beneath the shell-owned `main` landmark
    on both create and edit routes and locked that boundary in the focused
    structural contract.

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

1. Implement AS-06 Ticket 3: the assembly repository, creator/shared-read
   access, Ready revision commands, and read-only Pool/Blueprint preview.
2. Keep the new migration unapplied to the configured database until an
   explicit deployment/rollback decision is made; do not reset or reseed it.

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
- [x] Schedule & akses admission, result policy, and audit reason survive a
  Review → Schedule & akses tab switch without saving.
- [x] Review renders nine readiness checks and blocks Publish when the locked
  Tryout or source configuration is not publishable.
- [x] Mobile (`390px`) and tablet (`900px`) layouts have no horizontal body
  overflow; the mobile tab rail exposes a scroll cue and auto-reveals the
  active tab.
- [x] Tryout workspace uses one `main` landmark and no section selector
  `role="listitem"` override.

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

### Random assembly decision record

- **Random assembly resolves at release**: Pool and Blueprint resolution is
  AssessmentRelease-owned; CAT releases pin the explicit candidate set and
  canonical 2PL parameters. Stale explicit Pool candidates, quota shortages,
  and calibration drift block new publication without mutating existing
  releases.
  - Context: Keeps previews illustrative while making every delivered form
    reproducible and auditable.
  - Alternatives considered: Per-participant Pool draws, silent candidate
    replacement, quota fallback, and mentor-controlled seeds were rejected.

## Files Modified This Session

- `modules/mentor/KaptenTryoutBuilderPageModule.tsx` - Eight-area workspace
  projections, tab persistence, preview, release/publish boundary, and locked
  state.
- `app/mentor/tryout/[tryoutId]/page.tsx` - Preserve workspace query values on
  reload.
- `scripts/test-tryout-authoring-workspace.ts` - Focused AS-05 contract checks.
- `package.json` - Focused AS-05 test script.

- `prisma/schema.prisma` - Random assembly modes, scopes, rules, revision
  metadata, and AssessmentRelease assembly fields.
- `prisma/migrations/20260822130000_add_random_assembly_schema/migration.sql`
  - Forward-only schema/backfill and database guard functions/triggers.
- `scripts/test-random-assembly-schema.ts` - Static schema contract.
- `scripts/test-random-assembly-schema-db.ts` - Opt-in disposable local DB
  contract for migration guards.

- `lib/tryout/participant-view.ts` - Canonical mentor participant projection.
- `lib/tryout/delivery-repository.ts` - Atomic admission, assignment, and revoke transitions.
- `lib/tryout/operations-view.ts` - Owner-scoped operations serialization.
- `modules/mentor/KaptenTryoutParticipantsPageModule.tsx` - Participant list projection.
- `modules/mentor/KaptenTryoutParticipantDetailPageModule.tsx` - Summary and session selection controls.
- `scripts/test-assessment-participant-view.ts` - AS-04 contract coverage.
- `_harness/tracking/progress.md` - random assembly planning handoff.
- `_harness/tracking/session-handoff.md` - random assembly decisions and next
  implementation step.

## Evidence of Completion

- [x] AS-05 contract: `pnpm test:tryout-authoring-workspace`.
- [x] Type check: `pnpm exec tsc --noEmit --pretty false`.
- [x] Diff check: `git diff --check`.
- [x] Full verification: `pnpm verify` passed through the AS-05 landmark-composition
  commit hook;
  lint has 0 errors and 459 baseline warnings, and production build passed.
- [x] Impeccable deterministic detector: no findings (`[]`).
- [x] Authenticated ego-browser desktop/mobile QA and interaction checks.
- [x] Fresh AS-05 final review: PASS against `72b95e9`; artifact recorded at
  `reviews/as05-tryout-authoring-workspace-final-72b95e9-review-20260822`.
- [x] AS-06 schema contract: `pnpm test:random-assembly-schema`.
- [x] AS-06 isolated DB contract: `pnpm test:random-assembly-schema-db` against
  a disposable local PostgreSQL database after replaying all 31 migrations.
- [x] AS-06 schema/release regression contracts, Prisma validate/generate,
  TypeScript, focused ESLint, diff-check, and `pnpm verify` passed; the schema
  commit is `4f2dbd0` and the configured database remains at its prior 30
  applied migrations.
- [x] Tests pass: `pnpm test:assessment-participant-view`, participant UX, AssessmentRelease/package/release/scoring invariants, and Tryout scoring contract.
- [x] Type check clean: `pnpm exec tsc --noEmit --pretty false`.
- [x] Repository verification: `pnpm verify` passed through the AS-04 commit hook; lint has 459 known warnings and 0 errors, and production build passed.
- [x] Prisma migration status: all 30 migrations are applied; AS-04 required no schema change.
- [x] Manual code review: no blocking findings; review artifact recorded under `reviews/as04-participant-view-review`.

## Notes for Next Session

AS-05 implementation is committed as `1ea7b3d` (`feat: consolidate tryout
 authoring workspace`), tablet containment as `c22ecb2`, finish-review fixes
as `17a9d53` (`fix: close AS-05 workspace review gaps`), the explicit
draft-save regression guard as `a1bca11`, and the shell landmark composition
contract as `72b95e9`. AS-04 remains `ae64528`; AS-03 is `cb1eb8f` with
hardening `7f60c43`; AS-09 backend/UI is `43dec31` plus the seed compatibility
fix. All 30 migrations are applied and the configured database was intentionally
reset/reseeded after explicit approval; preserve unrelated preview/harness/
document history. AS-05 introduces no migration and no DB mutation smoke is
needed beyond the existing release/runtime evidence; its new behavior is
covered by focused contracts, full verification, authenticated browser QA, and
the fresh final finish-review PASS against `72b95e9` recorded at
`reviews/as05-tryout-authoring-workspace-final-72b95e9-review-20260822`.

AS-06 Pool-first authoring is approved and AS-06 Ticket 2 is committed as
`4f2dbd0` (`feat: add random assembly schema boundaries`). The migration is
forward-only and has been replayed through all 31 migrations in an isolated
local PostgreSQL instance, but it has not been deployed to the configured
database. The next implementation session should start Ticket 3: repository
commands, creator/shared-read authorization, Ready revisions, and read-only
Pool/Blueprint preview.

# Session Progress Log

## Mentor dashboard schedule and activity alignment (2026-08-28)

- [x] Aligned the activity title/type block with its leading icon by
  dashboard-scopedly overriding the shared row's baseline alignment after the
  date affordance became a 44px chevron link.
- [x] Removed the `Jadwal berikutnya` subtitle and `Kuis`/`Tryout` filters,
  and updated the loading state to reserve matching heading rows without the
  removed subtitle.
- [x] Focused ESLint, `test:mentor-dashboard-ia`, `git diff --check`, and the
  Impeccable layout detector (`[]`) pass.
- [x] `pnpm build` passes on the current tree through TypeScript, static page
  generation, and route optimization.
- [x] Browser QA was skipped because the active harness requires explicit
  permission and the coordinating agent requested no browser check.
- [x] Commit: `e1d2fbf` (`fix: refine mentor dashboard schedule`).

## Mentor dashboard activity navigation alignment (2026-08-28)

- [x] Moved `Aktivitas terbaru` into the same `ReferenceSectionHeading`
  treatment as `Jadwal berikutnya`, with the feed's nested heading and marker
  hidden through dashboard-local styling to avoid duplicate headings.
- [x] Replaced each activity date with an accessible 44px right-chevron link
  to the resource's existing detail route while retaining the title link,
  stacked resource type, and student Materi gradient icon tile.
- [x] Focused ESLint, `test:mentor-dashboard-ia`, and `git diff --check` pass.
  `pnpm build` compiles the app but stops on an unrelated concurrent
  TypeScript error at `modules/mentor/KaptenMateriCataloguePageModules.tsx:291`
  (`catalogue` is undefined); that file was not modified.
- [x] Browser QA was skipped because the active harness requires explicit
  permission and the coordinating agent requested no browser check.
- [x] Commit: `0d2dcda` (`fix: align mentor activity navigation`).

## Mentor dashboard activity feed refinement (2026-08-28)

- [x] Removed the decorative green marker before `Aktivitas terbaru` on the
  mentor dashboard only.
- [x] Reduced activity rows to a stacked title and resource type plus the
  existing timestamp; subject labels and verbose resource descriptions are no
  longer rendered there.
- [x] Matched activity entry icon tiles to the student Materi mint gradient,
  forest-green icon color, and inset edge shadow without changing shared
  reference primitives.
- [x] Focused ESLint, `test:mentor-dashboard-ia`, and `git diff --check` pass.
  `pnpm build` reaches an unrelated concurrent syntax error in
  `modules/mentor/KaptenQuizDetailPageModule.tsx:315`.
- [x] Browser QA was skipped because the active harness requires explicit
  permission and the coordinating agent requested no browser check.
- [x] Commit: `f4e786d` (`fix: simplify mentor activity feed`).

## Mentor dashboard summary cleanup (2026-08-28)

- [x] Removed the three top summary cards (`Materi terbaru`, `Kuis terbaru`,
  and `Jadwal aktif`) from the mentor dashboard while preserving the activity
  feed and upcoming-schedule workspace.
- [x] Removed the matching three-card skeleton from the dashboard loading
  state; `app/mentor/dashboard/loading.tsx` continues to delegate to the same
  updated loading component.
- [x] Focused ESLint, `test:mentor-dashboard-ia`, `git diff --check`, and
  `pnpm build` pass. Repository-wide lint remains blocked by the preserved
  unrelated `tmp/reference/res1` diagnostics.
- [x] Browser QA was intentionally skipped after the updated harness required
  explicit permission; no browser verification is included for this change.
- [x] Commit: `84384bd` (`fix: remove mentor dashboard summary cards`).

## Tryout Policy and session authoring refinement (2026-08-28)

- [x] Removed the `Terpilih` badge from checked questions in the draft
  `Pilih bank soal` picker while preserving checkbox selection and the
  cross-section conflict notice.
- [x] Split the Policy option groups into independent reference surfaces for
  `Akses peserta` and `Jadwal rilis hasil` without changing save behavior.
- [x] Applied the reference sidebar, raised surface, recessed input, and quiet
  action treatment to `/mentor/tryout/[tryoutId]/operations/sessions/new`;
  the scoped route keeps its existing breadcrumbs, avatar menu, and guards
  while hiding the header search.
- [x] Replaced the reversed-session-window error with the specific
  `Waktu selesai harus setelah waktu mulai.` message in both client and server
  validation paths.
- [x] Authenticated browser QA at 1512px and 390px confirms the selected draft
  question has zero `Terpilih` badges, Policy has two cards, Buat sesi uses
  tokenized controls, the header search is absent, and no horizontal overflow
  is present. The reversed-time form alert is visible and the vague message is
  absent.
- [x] Focused ESLint, `test:tryout-authoring-workspace`,
  `test:mentor-dashboard-ia`, Impeccable layout detection, and
  `git diff --check` pass. Repository TypeScript remains blocked only by the
  preserved invalid `tmp/reference/res1` prototype.
- [x] Commit: `03f18b3` (`fix: align tryout policy and session creation`).

## Tryout reference header cleanup (2026-08-28)

- [x] Removed the hover background/transition from the reference sidebar logo
  while retaining its dashboard link and keyboard focus indication.
- [x] Removed the header search control from the scoped
  `/mentor/tryout/[tryoutId]` detail route; the avatar menu remains available.
- [x] Authenticated browser QA at 1496px and 390px confirms zero Tryout search
  inputs, one Kapten avatar menu, no reference-logo hover class, and no
  horizontal overflow.
- [x] Focused ESLint and Impeccable layout detector pass.
- [x] Commit: `939cb15` (`fix: simplify tryout reference header`).

## Tryout Sessions alignment correction (2026-08-28)

- [x] Moved Sessions status into the shared action row and reserved stable
  desktop tracks for status, primary-session action, and detail arrow, so
  cards with different action widths no longer shift their controls.
- [x] Kept the mobile action row compact and contained, with the title/date/
  release metadata remaining a full-width content block.
- [x] Authenticated browser QA at 1646px and 390px confirms matching status
  x-positions, matching arrow right edges, equal action-row center lines, and
  zero horizontal overflow.
- [x] Focused ESLint, Impeccable layout detector, and `git diff --check` pass.
- [x] Commit: `cf518c3` (`fix: stabilize tryout session alignment`).

## Tryout Delivery alignment follow-up (2026-08-28)

- [x] Aligned Delivery/Policy radio rows and their help affordances with the
  label text while preserving disabled states, descriptions, and save wiring.
- [x] Rebuilt the embedded Sessions card layout as a responsive two-part
  composition: title/date/release metadata stays together, while status,
  primary-session action, and the detail arrow remain aligned at desktop and
  mobile widths.
- [x] Removed only the repeated inner `Attempts` heading; the lifecycle tab
  remains labeled `Attempts` and the refresh/table content is unchanged.
- [x] Authenticated browser QA at 1496px and 390px confirms zero Policy radio
  center delta, no Sessions/Attempts horizontal overflow, stable Sessions
  action geometry, and no visible inner Attempts heading.
- [x] Focused ESLint, `test:tryout-authoring-workspace`,
  `test:mentor-dashboard-ia`, Impeccable layout detector, and
  `git diff --check` pass. The repository-wide verify hook remains blocked by
  preserved `tmp/reference/res1` prototype diagnostics.
- [x] Commit: `151b390` (`fix: align tryout delivery surfaces`).

## Tryout detail Results/sidebar follow-up (2026-08-28)

- [x] Kept the reference sidebar collapse toggle inside the minimized rail by
  removing only its collapsed horizontal footer padding; the 44px target stays
  intact.
- [x] Flattened the Results “Sesi yang ditampilkan” control onto the canvas
  and stacked its label and selector vertically at all breakpoints.
- [x] Removed the Results session release-status label (`Dirilis`) while
  preserving result rows, session selection, and URL state behavior.
- [x] Authenticated browser QA at 1440px and 390px confirms the collapsed
  toggle, vertical selector, zero page overflow, and zero visible `Dirilis`
  labels in Results.
- [x] Focused ESLint, Impeccable layout detector, authoring/dashboard
  contracts, and `git diff --check` pass.
- [x] Commit: `fc0cbc8` (`fix: refine tryout results controls`).

## Tryout detail reference control treatment (2026-08-28)

- [x] Added Vecalss-tokenized reference control contracts: recessed pale-mint
  inputs and listbox triggers with soft inset depth, plus a quiet white
  reference action button.
- [x] Applied the controls to Tryout detail Overview fields, bank/question
  search, bank picker, Results session selector, invitation picker, metadata/
  step/policy/session actions, and relevant save/submit controls without
  changing workflow behavior.
- [x] Replaced the Results and invitation raw native selects with the shared
  Base UI `ReferenceSelect`; keyboard/listbox selection, placeholder handling,
  disabled state, and selected indicators remain accessible.
- [x] Added mobile containment for the Results control/table layout; browser
  metrics at 390px show the selector and popup inside the viewport with no
  horizontal page overflow.
- [x] Focused ESLint, TypeScript diagnostics (baseline-only prototype errors),
  Impeccable layout detector, `test:tryout-authoring-workspace`,
  `test:mentor-dashboard-ia`, and `git diff --check` pass.
- [x] Commit: `a6c8be9` (`feat: align tryout detail controls with reference`).

## Tryout detail divider and surface alignment (2026-08-28)

- [x] Removed structural divider lines from the reference Tryout detail
  title row, mobile reference shell header, metadata save area, question
  pagination, and embedded attempts/results table rows; lifecycle tab
  underlines remain as navigation state.
- [x] Replaced remaining mint slabs/flat cards in the builder and embedded
  delivery/live/results areas with extracted raised/inset reference surfaces:
  white cards use soft ambient depth, supporting groups use mint inset
  treatment, and Delivery navigation uses the quiet mint active state.
- [x] Preserved lifecycle workflow, field interactions, save/publish behavior,
  delivery subareas, table semantics, and existing shell infrastructure.
- [x] Authenticated browser QA passes at 1440px and 390px for Overview,
  Delivery/Policy, and Results; reference wrapper/header/title rows have no
  bottom divider and no horizontal overflow.
- [x] Focused ESLint, Impeccable layout detector, `test:tryout-authoring-workspace`,
  `test:mentor-dashboard-ia`, and `git diff --check` pass. Repository TypeScript
  remains blocked only by the preserved invalid `tmp/reference/res1` prototype.
- [x] Commit: `85f969d` (`fix: align tryout detail surfaces with reference`).

## Reference workspace canvas continuity refinement (2026-08-28)

- [x] Updated only the `sidebarAppearance="reference"` branch of
  `MentorWorkspaceShell`: the full workspace wrapper and inner `SidebarInset`
  route surface now use the green-tinted `voyage-canvas` token continuously;
  white sidebar and card surfaces remain distinct surfaces.
- [x] Kept the default mentor shell unchanged and preserved the adopted
  routes' sidebar, header, content, and mobile drawer behavior.
- [x] Live geometry checks confirm the adopted dashboard, Tryout catalogue,
  and Tryout detail routes fill the viewport with one continuous canvas color
  on desktop and mobile; no horizontal overflow is present.
- [x] Focused ESLint, layout detector, and `git diff --check` pass.

## Tryout detail reference composition adoption (2026-08-28)

- [x] Applied the extracted reference page composition to
  `/mentor/tryout/[tryoutId]` while keeping the rollout bounded to this
  existing mentor/Kapten detail route.
- [x] Opted the route into the floating Vecalss-tokenized reference sidebar;
  replaced the outer title/action row with `ReferencePageHeader`, added a
  localized draft/published `ReferenceStatusBadge`, and used
  `ReferenceSurface` for neutral route/read-only/lineage notices.
- [x] Preserved the SectionRail, Identitas Tryout form, lifecycle tabs and
  delivery sub-navigation, direct-only question picker, save/lifecycle
  actions, navigation guard, and existing role-shell breadcrumbs/search/
  account/ScrollArea infrastructure.
- [x] Authenticated ego-browser QA passes for published Delivery and draft
  Overview states at desktop and 390px mobile widths; lifecycle tab switching,
  reference drawer/collapse behavior, and no-horizontal-overflow checks pass.
- [x] Focused ESLint, `git diff --check`,
  `pnpm test:tryout-authoring-workspace`, and
  `pnpm test:mentor-dashboard-ia` pass. Repository TypeScript and production
  build remain blocked by the preserved `tmp/reference/res1` syntax errors and
  existing `mdx-components.tsx` anchor/ref mismatch; the unrelated
  `test:tryout-live-result-workspaces` stale-regex assertion remains failing.

## Goals-inspired Tryout catalogue adoption (2026-08-28)

- [x] Selected `/mentor/tryout` as the closest non-student analogue to the
  reference Goals page: a role-owned collection with status filtering, search,
  creation, list rows, and empty/no-match states.
- [x] Applied the extracted Vecalss visual language to this route only:
  reference page header, count-bearing status controls, tokenized raised/inset
  surfaces, localized status badges, and centered empty-state treatment.
- [x] Preserved the existing tutor guard, MentorWorkspaceShell breadcrumbs,
  search/account infrastructure, Tryout links, pagination, search behavior,
  and create route. The route now opts into the page-scoped reference sidebar
  appearance; other mentor/Kapten/admin/student pages remain unchanged.
- [x] Authenticated ego-browser QA passes at desktop and 390px mobile widths,
  including status filtering, no-match/reset behavior, sidebar collapse, and
  mobile Sheet body-scroll locking.
- [x] Follow-up overflow fix keeps the reference sidebar's collapsed brand mark
  inside the icon rail while preserving the full lockup in expanded and mobile
  states; live geometry reports no child overflow.
- [x] Focused ESLint and `git diff --check` pass; repository TypeScript remains
  blocked only by the preserved invalid `tmp/reference/res1` prototype.

## First mentor dashboard adoption (2026-08-28)

- [x] Selected the unowned `/mentor/dashboard` route as the first bounded
  non-student adoption surface; no other mentor, Kapten, admin, or student
  route was changed.
- [x] Replaced the dashboard content blocks with the extracted
  `ReferencePageHeader`, stat cards, activity feed, task cards, surface, and
  empty state while preserving `MentorWorkspaceShell` infrastructure.
- [x] Kept recent resource links actionable and localized the extracted status
  map for mentor content states (`Draf`, `Terjadwal`, `Diterbitkan`, and
  `Diarsipkan`).
- [x] Applied the reference sidebar appearance only on `/mentor/dashboard`:
  floating Vecalss-tokenized rail, mint active navigation, 44px targets, and
  a desktop collapse affordance while preserving the existing Sidebar/Sheet
  behavior. Other Kapten pages remain unchanged.
- [x] Updated `test:mentor-dashboard-ia`; focused contract, focused ESLint,
  Impeccable detector, and production compilation pass.
- [x] Authenticated ego-browser visual QA passes at desktop and 390px mobile
  widths, including sidebar collapse and mobile Sheet open/close.
- [x] Commit: `3777553` (`feat: adopt dashboard components on mentor home`).

## Reference dashboard component extraction (2026-08-27)

- [x] Inspected `tmp/reference/res1` custom dashboard components and separated
  reusable visual patterns from its Base44/auth/data/page contracts.
- [x] Added the isolated `components/dashboard/` layer: Vecalss-tokenized
  raised/inset surfaces, responsive shell, headers, progress/stat blocks,
  statuses, activity/goals/tasks, and a fixture-only preview composition.
- [x] Kept student pages and all mentor/Kapten/admin route wiring untouched.
- [x] Navigation icons use rendered `ReactNode` slots so server routes can
  safely pass them through the client shell boundary.
- [x] Focused ESLint and Impeccable detector pass; implementation commits are
  `de0189c` and `6881d48`.
- [ ] Next: preview the isolated layer, then choose one bounded non-student
  mentor/Kapten/admin adoption after confirmation.

## Tryout direct-only question authoring simplification (2026-08-25)

- [x] Simplified `KaptenTryoutBuilderPageModule` to one visible question-source
  path: `Pilih langsung` → choose a Bank Soal → checklist questions for the
  active Section.
- [x] Removed CAT mode/rules, source-mode selection, Ready assembly picker and
  preview/mock surfaces from the authoring UI. Selected question ordering is
  now always randomized in defaults, normalization, and save payloads.
- [x] Updated the direct-question, simplified-authoring, and workspace contracts;
  TypeScript, focused ESLint, `git diff --check`, and `pnpm verify` pass.
- [x] Commit: `f21d058` (`refine: simplify tryout question source UI`). Legacy
  package/CAT server shapes remain only for compatibility with previously
  persisted/released data; they are not authoring controls.
- [x] Removed the leftover participant-preview dialog and tightened the
  Configure Sections footer to one primary `Selanjutnya` action with no icon;
  the workspace contract and browser semantic check pass (`f5bad7b`).
- [x] Collapsed draft Review & Publish to one summary workspace in `8884f20`:
  removed the Readiness and Published versions inner tabs/checklist cards,
  summarized Tryout title, description, Sections, and durations, and kept one
  `Terbitkan Tryout` primary action with no duplicate footer publish action.
  Legacy `workspace=publish` links now normalize to the summary view.
- [x] Focused authoring contracts, TypeScript, focused ESLint, `git diff --check`,
  full `pnpm verify`, and authenticated browser semantic QA pass for the
  summary-only Review & Publish state.
- [x] Simplified the remaining builder chrome in `9befe2a`: removed the phase
  intro card, inline unsaved-status banner, and action dividers; kept only the
  icon-only back control and relevant lifecycle navigation. Build now places a
  title-only `Informasi dasar` block above the direct question-source picker,
  stacks duration/instructions vertically, and removes the redundant source
  lead-in. Review has no empty draft footer. Focused contracts, TypeScript,
  full `pnpm verify`, and authenticated desktop browser QA pass.

## Tryout lifecycle refactor closeout (2026-08-24)

- [x] Implemented the draft/published progressive-disclosure contract in the
  mentor Tryout builder. Drafts expose Overview → Configure Sections →
  Readiness & Publish; published Tryouts expose Delivery → Operations →
  Results, with a locked lifecycle roadmap for orientation.
- [x] Added the pure server-backed workflow projection at
  `lib/tryout/workflow-projection.ts` and included its phase/gate/session
  identifiers in the serialized operations DTO without returning release or
  Bank Soal payloads. Legacy step aliases and historical operational evidence
  remain monotonic; Live stays selected-session/runtime-eligible.
- [x] Removed global header Preview/Save/Review actions. Save, continue, and
  publish now live in the sticky draft footer with explicit Save/Discard/Stay
  handling and failed-save preservation; Configure Sections keeps only the
  primary `Selanjutnya` action.
- [x] Added published title/description-only **Edit details**, explicit
  **Buat draf perubahan** lineage (`parent` query), and session-aware Results
  selection (`?session=`) plus selected-session Live filtering.
- [x] Updated `docs/tryout-gated-workflow-refactor-plan.md` and
  `docs/tryout-creation-guide.md` to describe the implemented contract and
  keep historical screenshots clearly labeled.
- [x] Verification: `pnpm test:tryout-workflow-projection`,
  `pnpm test:tryout-authoring-workspace`, `pnpm test:tryout-live-result-workspaces`,
  focused assembly/direct-question contracts, focused ESLint,
  `pnpm exec tsc --noEmit`, and full `pnpm verify` pass. Authenticated browser
  QA remains a follow-up after unrelated concurrent dirty admin-preview work
  settles.

## Current State

**Last Updated:** 2026-08-23
**Session ID:** assessment-as04-invitation-picker-closeout
**Active Feature:** AS-04 dedicated invitation-picker UI closeout

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

- [x] AS-06 assembly repository and preview (Ticket 3, `9a1e306`)
  - Added server-only draft create/update commands with package aggregate
    locking, deterministic source locks, server-owned revision/digest/media
    rereads, and named draft/version DTOs.
  - Added creator/admin mutation authorization with shared Kapten Ready list
    and detail reads; existing Tryout Ready binding now treats published
    revisions as shared assets rather than creator-owned rows.
  - Added Pool, Blueprint, CAT Pool, and fixed-Set shape/readiness checks with
    structured stale, duplicate, wrong-Subtest, inactive/archived Bank,
    options, explanation, media, quota, shortage, and canonical-2PL
    calibration errors.
  - Added immutable Ready revision creation that snapshots candidate content
    and options into version-owned rows; Blueprint Ready freezes scope/quota
    without resolving a final question list.
  - Added a read-only temporary-seed preview and server-action adapters; the
    preview returns an illustrative sample/readiness report and has no durable
    writes.
  - Added `test:random-assembly-repository`; focused repository/schema/direct/
    AS-05 contracts, TypeScript, focused ESLint, diff-check, and `pnpm verify`
    pass at its checkpoint; Ticket 7 later applied migration 31 through the
    approved development reset/reseed.

- [x] AS-06 seeded Pool and Blueprint release resolution (Ticket 4, `5311eda` + `2e0915c`)
  - AssessmentRelease creation now locks the Tryout aggregate, sorted Ready
    assembly revisions, and deterministic source rows before resolving a form.
  - Pool candidates are reread against current Question/Revision/Bank/Subtest
    readiness and provenance; stale candidates, duplicate identity, shortage,
    invalid content, and unready media fail closed without replacement.
  - Blueprint releases resolve current Ready questions in the version-owned
    Bank/folder/category scope and active Subtest with exact Easy/Medium/Hard
    quotas; scope-only Ready versions are materialized into the physical bridge
    only at release.
  - Persisted per-section release payload metadata includes resolver version,
    seed, requested/available counts, quotas/scope, resolved source IDs, and
    revision digests. Same intent keys are deterministic; active bound sessions
    prevent seeded bridge replacement.
  - Focused Pool/Blueprint, repository/schema/direct/AS-05, release/package
    invariants, TypeScript, focused ESLint, diff-check, and `pnpm verify` pass;
    Ticket 7 later applied migration 31 through the approved development
    reset/reseed.

- [x] AS-06 CAT Pool release pinning (Ticket 5, `347cc37` + `e4bb17c` + `1ef8e85`)
  - CAT Pool publication locks the Ready version, explicit candidate source
    rows, Subtests, and canonical calibration rows in deterministic order.
  - Every candidate is revalidated for Ready revision identity/digest,
    provenance, active Bank/Subtest, content/options/media, approved canonical
    `2pl-canonical-v1`, and finite positive parameters. Candidate count equal
    to delivered count is accepted; shortages and drift block new releases.
  - AssessmentRelease payloads pin all candidate snapshots and calibration
    provenance/parameters. Runtime keeps its existing information-maximizing
    selection, no-back-navigation/no-CBT-fallback rules, and writes the
    acknowledged answer before marking calculation failures.
  - Existing CAT Pool releases remain usable after source/calibration drift;
    mixed CAT Pool plus direct-CAT Tryouts revalidate only unpinned CAT
    sections. Focused CAT/random/repository/schema/direct/package/release
    contracts, TypeScript, focused ESLint, diff-check, and `pnpm verify` pass.
    The broad AssessmentRelease invariant is blocked only by unrelated dirty
    admin-preview edits; Ticket 7 later applied migration 31 through the
    approved development reset/reseed.

- [x] AS-06 Tryout assembly attachment and E2E verification (Tickets 6–7,
  `4c85278` + `617735f` + `01e4078` + `cb49aac`)
  - Tryout Questions now discovers shared Ready Set/Pool/Blueprint/CAT Pool
    revisions, attaches one source per Section, previews an exact revision,
    persists the bridge through the existing save boundary, and surfaces
    mode-specific Review blockers before the server-authoritative publish.
  - Final Ticket 6 review is PASS. Immutable published-version identity,
    package-draft survival, source status, Subtest, test-type, CAT numeric,
    fixed-snapshot, and picker-semantics gates are covered.
  - Ticket 7 replayed all 31 migrations against the approved development
    database after the migration backfill trigger fix, reseeded the fixture,
    passed `db:verify-demo`, and completed authenticated ego-browser desktop/
    mobile QA for attach, preview, save, Review, and Publish gating.
  - At the time of Ticket 7 this section intentionally left Kuis assembly
    deferred; that follow-up is now complete in the closeout below.

- [x] AS-06 durable Kuis assembly binding (`047d5d7`, `331b7c7`, `4791020`,
  `a892ec4`, `394e240`)
  - Added durable `StandaloneQuiz` assembly mode, package-version identity,
    definition digest, and deterministic seed fields with migrations
    `20260823100000_add_standalone_quiz_assembly_binding` and
    `20260823110000_pin_kuis_assembly_version_identity`; both are applied to
    the authorized development database and migration status is current.
  - Server-owned Set/Pool/Blueprint attachment revalidates Ready identity,
    source revision/digest/provenance, Bank/Subtest scope, content/options,
    media, and canonical definition digest. CAT Pool, multi-Bank, wrong
    Subtest, forged direct-plus-assembly, and invalid legacy rows fail closed.
  - Fixed Sets use immutable version-item snapshots, so normal source edits do
    not invalidate a pinned Ready revision; package draft identity edits do
    not break the published version boundary. Reload, save, bulk publish,
    attach, and persisted detach preserve the binding contract.
  - Saved-quiz detach updates the server first, retains canonical materialized
    items, and preserves unrelated unsaved editor changes; clean editors stay
    clean. Existing direct/fixed Kuis behavior remains compatible.
  - `pnpm test:kuis-assembly-binding`, related assembly/direct/release
    contracts, Prisma validate/migrate status, TypeScript, focused ESLint,
    diff-check, and `pnpm verify` pass. Authenticated ego-browser QA covered
    Ready Pool attach, reload, detach, direct recovery, mobile 390px layout,
    and dirty-state preservation. Impeccable detector `[]`; final review PASS:
    `reviews/as06-kuis-assembly-binding-final-review-394e240-20260823`.
  - The broad `test:assessment-release-invariants` baseline remains blocked
    only by the preserved unrelated admin-preview dirty source.

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
  - Follow-up `848fd78` scopes the lifecycle roadmap to the current mode so
    drafts show only Build/Review & Publish and published Tryouts show only
    Delivery/Operations/Results; the focused contract, lint, browser QA, and
    commit-hook `pnpm verify` pass.
  - Follow-up `82733ee` separates Overview into its own phase before Build,
    removes the single-item Build tab strip, and reduces draft progression to
    one auto-saving `Selanjutnya` action without the arrow icon; focused
    contract, TypeScript, lint, detector, browser QA, and commit-hook
    `pnpm verify` pass.
  - Follow-up `bdb44a4` removes the workspace title, description, status badges,
    and authoring-mode copy, leaving an accessible icon-only chevron-back
    control; focused contract, TypeScript, lint, browser QA, and commit-hook
    `pnpm verify` pass.

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
- [x] AS-07 Live delivery and result workspaces
  - Commits `ea0d296`, `d437043`, and `6fd1794` add server-owned Live,
    Attempts, Results, and participant/attempt navigation inside the existing
    Tryout workspace. Score/release sanitization, human-review-only integrity
    signals, mobile active-tab scrolling, and single-landmark detail routes
    are covered by focused contracts and the final review artifact.
  - Authenticated ego-browser QA passed at 1512px and 390px; Impeccable audit
    is 18/20 with no P0/P1 findings. The realtime hardening follow-up below
    closes the previously deferred lifecycle writers and expiry reconciliation.

- [x] AS-07 realtime/polling hardening (`d8eb288`, `59d090e`, `ba1291c`)
  - Added authenticated/idempotent disconnect-start and reconcile commands with
    deterministic scope locks, audit events, origin-run binding, and
    fail-closed legacy/cross-run guards.
  - Authoritative deadline synchronization closes a verified open marker once,
    bounds elapsed time to server/session/run deadlines, records a terminal
    audit, and leaves score/release state untouched. Terminal Live states take
    precedence over stale markers.
  - Live operations discovery uses owner checks outside the loop and one short
    transaction per candidate with a shared timestamp, preventing refresh
    locks from spanning candidates and deadlocking participant start/revoke.
  - Live refresh is visibility-aware at 15 seconds, in-flight guarded, capped
    after three automatic failures, and manually retryable. DTO sanitization,
    release/score boundaries, and human-review-only integrity semantics remain
    intact.
  - Focused realtime/live/authoring/participant contracts, TypeScript, focused
    ESLint, diff-check, and `pnpm verify` pass (0 errors; 459 existing
    warnings). Authenticated ego-browser QA passed at 1512px and 390px;
    Impeccable detector `[]`; final independent review PASS at
    `reviews/as07-realtime-hardening-final-independent-review-20260823`.
  - The broad `test:assessment-release-invariants` baseline remains blocked
    only by the preserved unrelated admin-preview dirty source.

- [x] AS-04 dedicated invitation-picker UI (`a72d5fd`, `5c422ac`)
  - Added an owner-scoped student search action that returns only safe selector
    identity and active assignment context; email, full account metadata, and
    raw operations payloads remain outside the client boundary.
  - Added the Kapten Participants picker with loading/empty/error states,
    keyboard combobox/listbox navigation, selected-student confirmation,
    available-session choice, required Bahasa audit reason, and idempotent
    invite action using the existing server-owned transition.
  - Invite refresh now applies `toTryoutWorkspaceView`: hidden participant
    scores are nulled and `sessions[].attempts` plus release/integrity payloads
    are stripped. Busy search/selection callbacks are invalidated and ignored;
    `aria-expanded`, `required`, and `aria-required` semantics are covered.
  - Focused invitation/participant/live contracts, focused ESLint, diff-check,
    Impeccable detector `[]`, authenticated ego-browser desktop/mobile QA, and
    lint/build verification pass. Full TypeScript/verify stop only on the
    unrelated concurrent `scripts/test-admin-student-preview-surfaces.ts`
    `ProcessEnv.NODE_ENV` fixtures; all six concurrent files remain unstaged.

### What's In Progress

- None for the current AS-04 invitation-picker slice.

### What's Next

1. Preserve the six unrelated admin-preview/config files and record the known
   TypeScript/AssessmentRelease baseline separately from feature verification.
2. Continue with the next approved backlog slice; do not reopen AS-08 physical
   QuestionRevision/Ready lifecycle unless a new defect is found.

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
- `lib/tryout/assembly-validation.ts` - Pure assembly shape/error/seed helpers.
- `lib/tryout/assembly-repository.ts` - Draft, Ready, access, validation, and
  read-only preview repository commands.
- `modules/mentor/assembly-actions.ts` - Authenticated server-action adapters.
- `scripts/test-random-assembly-repository.ts` - Focused repository contract.
- `lib/tryout/assessment-release.ts` - Seeded Pool/Blueprint release
  resolution, idempotency, source locks, blockers, metadata, and physical
  bridge materialization.
- `lib/tryout/repository.ts` - Blueprint scope-only Ready publish allowance and
  publication intent forwarding.
- `scripts/test-random-assembly-release.ts` - Focused resolver/release contract.
- `/Users/ravel/.traycer/epics/788a92f9-1c5a-4fc5-b873-76ac11c9949c/artifacts/reviews/as06-pool-blueprint-release-resolution-final-review-20260822/index.md` - Final review artifact.
- `scripts/test-cat-pool-release.ts` - CAT Pool release pinning contract.
- `/Users/ravel/.traycer/epics/788a92f9-1c5a-4fc5-b873-76ac11c9949c/artifacts/reviews/as06-cat-pool-release-pinning-fresh-review-20260822/index.md` - Fresh Ticket 5 review artifact.

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
  commit is `4f2dbd0`; Ticket 7 later replayed all 31 migrations against the
  approved configured development database.
- [x] AS-06 Ticket 3 repository contract: `pnpm test:random-assembly-repository`,
  AS-06 schema/direct/AS-05/package/release/AssessmentRelease contracts,
  TypeScript, focused ESLint, diff-check, and full `pnpm verify` passed;
  implementation commit is `9a1e306`; Ticket 7 later replayed all 31 migrations
  against the approved configured development database.
- [x] AS-06 Ticket 4 release contract: deterministic Pool/Blueprint resolver,
  stale/shortage/duplicate/content/media/mode blockers, Blueprint publish
  materialization, publication intent seed handling, active-session bridge guard,
  repository/schema/direct/AS-05/package/release contracts, TypeScript, focused
  ESLint, diff-check, and full `pnpm verify` passed; implementation commits are
  `5311eda` and `2e0915c`, with no configured-database migration run.
- [x] AS-06 Ticket 5 CAT Pool release contract: deterministic candidate/source/
  calibration locks, stale/digest/provenance/content/media/canonical-2PL
  blockers, exact-size acceptance, release-owned candidate/calibration
  payloads, mixed CAT Pool/direct-CAT old-release reuse, CAT/random/repository/
  schema/direct/package/release contracts, TypeScript, focused ESLint,
  diff-check, and `pnpm verify` passed; implementation commits are `347cc37`,
  `e4bb17c`, and `1ef8e85`. Ticket 7 later applied migration 31 through the
  approved development reset/reseed; the broad AssessmentRelease invariant is
  blocked by unrelated admin-preview edits.
- [x] AS-06 Ticket 6 final review: PASS at
  `reviews/as06-assembly-attachment-integration-final-fresh-review-01e4078-20260823`;
  implementation is `4c85278` + `617735f` + `01e4078`.
- [x] AS-06 Ticket 7 E2E: configured development database reset/reseed with
  all 31 migrations up to date, `pnpm db:verify-demo` PASS, focused contracts/
  tsc/ESLint/diff-check/`pnpm verify` PASS, and authenticated ego-browser task
  space 20 desktop/mobile attach and Publish-gate QA PASS.
- [x] Known baseline boundaries recorded: the broad AssessmentRelease
  invariant is blocked by the preserved dirty admin-preview source, and the
  opt-in schema DB contract was skipped without
  `RANDOM_ASSEMBLY_SCHEMA_TEST_DATABASE_URL`.
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

AS-06 Pool-first authoring is approved; Tickets 2–5 are complete. Ticket 2 is
committed as `4f2dbd0`; Tickets 3–5 are `9a1e306`, `5311eda`/`2e0915c`, and
`347cc37`/`e4bb17c`/`1ef8e85`. Ticket 6/7 Tryout attachment and E2E are
complete, and the durable Kuis binding follow-up is now complete at
`047d5d7`/`331b7c7`/`4791020`/`a892ec4`/`394e240`. Migrations 32 and 33 are
applied to the authorized development database. Preserve the unrelated dirty
admin-preview files.

AS-07 is complete at `ea0d296` + `d437043` + `6fd1794`; final review PASS is
recorded at `reviews/as07-live-delivery-result-workspaces-final-fixup-review-
20260823`, and the Impeccable audit is
`reviews/as07-live-delivery-result-workspaces-impeccable-audit-20260823`.
The development server QA used the seeded published Tryout
`90c28688-58ab-401c-9f1c-3cb961f33c33`; do not treat that fixture as a new
production seed. The current next slice is AS-07 realtime/polling hardening
under `artifacts/tickets/as07-realtime-hardening`: authoritative
disconnect/reconcile writers, deadline-expiry synchronization, and bounded
Live refresh/polling. AS-08 remains closed.

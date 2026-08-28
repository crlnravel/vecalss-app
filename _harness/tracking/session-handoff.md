# Session Handoff

## Mentor dashboard activity feed refinement (2026-08-28)

- Objective: make the mentor dashboard's `Aktivitas terbaru` feed quieter and
  easier to scan while preserving its links and timestamps.
- Implementation: `f4e786d` keeps the shared `ReferenceActivityFeed` intact but
  scopes presentation changes to `MentorDashboardPageModule.tsx`: the header
  marker is hidden, activity data contains only title/type/timestamp, and row
  icon tiles use the student Materi mint gradient and inset shadow. Subject
  labels and verbose descriptions are removed from activity rows only; task
  cards retain their existing summaries.
- Verification: focused ESLint, `test:mentor-dashboard-ia`, and
  `git diff --check` pass. `pnpm build` is blocked by a concurrent syntax
  error in `modules/mentor/KaptenQuizDetailPageModule.tsx:315`; that file was
  not modified.
- Browser QA: intentionally skipped because the active harness requires
  explicit permission before ego-browser verification and the coordinating
  agent requested no browser check.
- Scope: only the mentor dashboard activity presentation changed; shared
  reference primitives and the Bank Soal/Materi agent-owned page groups remain
  untouched. Existing `.agents/skills/information-architecture/` remains
  untracked and untouched.

## Mentor dashboard summary cleanup (2026-08-28)

- Objective: remove the top summary-card section from the mentor dashboard.
- Implementation: `84384bd` removes the live `ReferenceStatGrid` cards and the
  matching three-card loading skeleton from
  `modules/mentor/MentorDashboardPageModule.tsx`; activity, schedule, quick
  create, navigation, and data projections remain unchanged.
- Verification: focused ESLint, `test:mentor-dashboard-ia`,
  `git diff --check`, and `pnpm build` pass. The repository-wide lint and the
  commit hook remain blocked by unrelated diagnostics under
  `tmp/reference/res1`.
- Browser QA: intentionally skipped because the updated harness requires
  explicit permission before ego-browser verification and none was granted.
- Scope: only the mentor dashboard module changed; the route loading entry
  point delegates to the updated loading component. Existing
  `.agents/skills/information-architecture/` remains untouched, as do the
  Bank Soal and Materi agent-owned page groups.

## Tryout Policy and session authoring refinement (2026-08-28)

- Objective: finish the reference treatment for the scoped Tryout draft
  picker, Delivery Policy, and nested Buat sesi route, and make invalid session
  windows explain the correction.
- Implementation: `03f18b3` removes the selected-question `Terpilih` badge,
  gives Policy separate reference surfaces for `Akses peserta` and `Jadwal
  rilis hasil`, and opts `/mentor/tryout/[tryoutId]/operations/sessions/new`
  into the reference sidebar and controls. Existing session fields, switches,
  action wiring, breadcrumbs, account menu, and route guard remain intact.
- Validation: both client and delivery-repository create paths report
  `Waktu selesai harus setelah waktu mulai.` when Selesai is not after Mulai;
  missing names continue to receive their own required-field message.
- QA: authenticated ego-browser checks at 1512px and 390px confirm a selected
  draft question with no `Terpilih` badge, two Policy cards, reference-styled
  create-session controls, no header search, no mobile overflow, and the
  specific reversed-time alert without the former vague message.
- Verification: focused ESLint, `test:tryout-authoring-workspace`,
  `test:mentor-dashboard-ia`, Impeccable layout detector `[]`, and
  `git diff --check` pass. Repository `tsc` remains blocked by the preserved
  invalid `tmp/reference/res1` syntax diagnostics.
- Scope: only Tryout authoring/delivery surfaces changed; no student, admin,
  or unrelated mentor/Kapten page was changed. Existing untracked
  `.agents/skills/information-architecture/` and the unrelated
  `MentorDashboardPageModule.tsx` edit remain untouched.

## Tryout reference header cleanup (2026-08-28)

- Objective: simplify the scoped reference-styled Tryout detail header.
- Implementation: `939cb15` removes the hover surface/transition from the
  reference sidebar logo (default mentor sidebar behavior is unchanged) and
  passes `showSearch={false}` only to `/mentor/tryout/[tryoutId]`.
- QA: authenticated ego-browser checks at 1496px and 390px confirm no
  `Cari Tryout...` header input, the Kapten avatar menu remains present, the
  reference logo link has no `hover:bg-primary-50` class, and the page has no
  horizontal overflow.
- Verification: focused ESLint and Impeccable layout detector `[]` pass.
- Scope: no student/admin/unrelated routes changed; existing untracked
  `.agents/skills/information-architecture/` remains untouched.

## Tryout Sessions alignment correction (2026-08-28)

- Objective: remove the last visible Sessions-card drift caused by different
  primary-action widths.
- Implementation: `cf518c3` places status, primary action, and arrow in one
  shared action row, with fixed desktop grid tracks and the existing compact
  mobile row. Session metadata remains a full-width left content block.
- QA: authenticated ego-browser checks at 1646px and 390px show both status
  badges sharing x=1323px on desktop, both arrows sharing the right edge,
  status/action/arrow center lines aligned per card, and page/body widths
  equal to the viewport.
- Verification: focused ESLint, Impeccable layout detector `[]`, and
  `git diff --check` pass.
- Scope: only the embedded Sessions composition changed; no student, admin, or
  unrelated mentor/Kapten pages changed; existing untracked
  `.agents/skills/information-architecture/` remains untouched.

## Tryout Delivery alignment follow-up (2026-08-28)

- Objective: resolve the remaining Policy radio and Sessions alignment issues
  and remove the repeated inner Attempts heading on the scoped Tryout detail
  route.
- Implementation: `151b390` centers one-line Policy radio rows (while keeping
  description rows top-aligned), replaces the Sessions card header grid with a
  responsive metadata/action layout, and removes only the module-level
  `Attempts` heading while retaining its refresh toolbar and table.
- QA: authenticated ego-browser checks at 1496px and 390px show Policy radio
  label center deltas of 0px, Sessions title/date/release metadata free of
  action-column squeezing, action/arrow controls inside each card, and no
  horizontal overflow. Attempts has no inner `h2`, while the lifecycle tab
  remains present.
- Verification: focused ESLint, `test:tryout-authoring-workspace`,
  `test:mentor-dashboard-ia`, Impeccable layout detector `[]`, and
  `git diff --check` pass. The full verify hook still reaches the preserved
  `tmp/reference/res1` diagnostics and is not a signal from these files.
- Scope: only the Tryout detail Delivery/Attempts modules changed; no student,
  admin, or unrelated mentor/Kapten pages changed; existing untracked
  `.agents/skills/information-architecture/` remains untouched.

## Tryout detail Results/sidebar follow-up (2026-08-28)

- Objective: address the last visual issues in the reference-styled Tryout
  detail route.
- Implementation: `fc0cbc8` removes collapsed horizontal padding from the
  reference sidebar footer so its toggle fits the icon rail, makes the Results
  session selector a direct canvas stack, and removes the Results release
  status indicator/copy.
- QA: authenticated browser checks at 1440px and 390px confirm the collapsed
  rail toggle stays within the inner sidebar bounds (trigger right edge
  64.75px vs inner right edge 69.5px), the Results label/selector stack
  vertically, page/body scroll widths remain equal to the viewport, and no
  visible Results `Dirilis` label remains.
- Verification: focused ESLint, Impeccable layout detector `[]`, focused
  authoring/dashboard contracts, and `git diff --check` pass.
- Scope: no student/admin/unrelated pages changed; existing untracked
  `.agents/skills/information-architecture/` remains untouched.

## Tryout detail reference control treatment (2026-08-28)

- Objective: bring the remaining Tryout detail inputs, dropdowns, and actions
  in line with the extracted reference Settings treatment.
- Implementation: `a6c8be9` adds shared `REFERENCE_CONTROL_CLASS_NAMES`, a
  `reference` Button variant, and client `ReferenceSelect`; these are applied
  within the Tryout detail builder and embedded Delivery/Results/Participants
  surfaces. The Results grid/table now constrains intrinsic content at mobile
  widths.
- QA: authenticated ego-browser checks at 1440px and 390px cover Basics and
  Results. At 390px, selector width is 298px with right edge 344px, popup right
  edge is 337.4px, and page/body scroll width remain 390px.
- Verification: focused ESLint (only prior unused-prop warnings), TypeScript
  remains blocked only by preserved `tmp/reference/res1` syntax diagnostics,
  Impeccable layout detector `[]`, focused authoring/dashboard contracts, and
  `git diff --check`.
- Scope: no student/admin/unrelated pages changed; existing untracked
  `.agents/skills/information-architecture/` remains untouched.

## Tryout detail divider and surface alignment (2026-08-28)

- Objective: finish the reference treatment on `/mentor/tryout/[tryoutId]`
  by removing structural separators and aligning lingering cards with the
  extracted raised/inset surfaces.
- Implementation: `85f969d` extends `ReferenceSurface` with semantic `as`
  elements; updates the Tryout builder, embedded Policy/Sessions/Participants/
  Live/Attempts/Results modules, and removes only the reference branch’s
  mobile header divider. Lifecycle tab underlines and existing workflow/data
  behavior remain intact.
- QA: authenticated ego-browser checks at 1440px and 390px cover Overview,
  Delivery/Policy, and Results. Title/header bottom border widths are 0px on
  mobile, wrapper/inset backgrounds remain continuous `voyage-canvas`, and
  body width equals viewport.
- Verification: focused ESLint (pre-existing unused-prop warnings only),
  Impeccable layout detector `[]`, focused authoring/dashboard contracts, and
  `git diff --check` pass. Full `tsc` remains blocked by preserved invalid
  `tmp/reference/res1` syntax diagnostics.
- Scope: no student, admin, or unrelated role pages changed; existing
  untracked `.agents/skills/information-architecture/` remains untouched.

## Reference workspace canvas continuity refinement (2026-08-28)

- Objective: make the green-tinted reference workspace canvas fill the whole
  viewport without an outside/inside background split.
- Implementation: only the `sidebarAppearance="reference"` branch of
  `MentorWorkspaceShell` uses `bg-voyage-canvas` on the full wrapper,
  `SidebarInset`, and header. White sidebar and card surfaces remain surfaces;
  the default shell branch remains unchanged.
- QA: live DOM geometry confirms `/mentor/dashboard`, `/mentor/tryout`, and
  `/mentor/tryout/[tryoutId]` use the same canvas background across wrapper and
  route surface at desktop and mobile widths, without horizontal overflow.
- Verification: focused ESLint, Impeccable layout detector, and
  `git diff --check` pass. Browser screenshot capture intermittently timed out
  after the local server restart, but computed backgrounds, bounds, and route
  content were verified against the seeded PostgreSQL-backed app.
- Scope: no default-shell, student, admin, or unrelated mentor/Kapten page was
  changed; the existing untracked `.agents/skills/information-architecture/`
  directory remains untouched.

## Tryout detail reference composition adoption (2026-08-28)

- Objective: apply the extracted Goals-like composition to the existing
  `/mentor/tryout/[tryoutId]` detail route without changing the Tryout builder
  workflow or widening the student-page rollout.
- Implementation: the route opts into `sidebarAppearance="reference"`.
  `KaptenTryoutBuilderPageModule` now uses `ReferencePageHeader`, a localized
  `ReferenceStatusBadge`, and `ReferenceSurface` for the outer header and
  neutral notices. The visual adapter is intentionally limited to outer
  composition.
- Preserved boundaries: SectionRail, Identitas Tryout, lifecycle tab/phase
  behavior, delivery area tabs, direct-only source/question flow, save and
  publish/unpublish/duplicate actions, dirty navigation guard, and the
  MentorWorkspaceShell breadcrumb/search/account/ScrollArea infrastructure.
- QA: authenticated ego-browser checks pass for published Delivery and draft
  Overview at desktop and 390px mobile widths. Lifecycle tab switching,
  reference sidebar collapse/mobile drawer, and no horizontal overflow pass.
  Focused ESLint, `git diff --check`, `test:tryout-authoring-workspace`, and
  `test:mentor-dashboard-ia` pass.
- Known baselines: repository `tsc` still reports only preserved invalid syntax
  in `tmp/reference/res1`; `pnpm build` compiles before the pre-existing
  `mdx-components.tsx` anchor/ref mismatch; `test:tryout-live-result-workspaces`
  still has its unrelated stale regex assertion.
- Scope: no student pages, admin pages, or other mentor/Kapten routes changed;
  the existing untracked `.agents/skills/information-architecture/` directory
  remains untouched.

## Goals-inspired Tryout catalogue adoption (2026-08-28)

- Objective: apply the reference Goals composition to one structurally similar
  non-student Vecalss page without widening the rollout.
- Target: `/mentor/tryout` catalogue. It retains the existing tutor guard,
  MentorWorkspaceShell breadcrumbs/search/account/ScrollArea infrastructure,
  server-owned Tryout data, links, pagination, and create route.
- Implementation: `modules/mentor/KaptenTryoutCataloguePageModule.tsx` now uses
  the extracted `ReferencePageHeader`, `ReferenceSurface`,
  `ReferenceEmptyState`, `ReferenceStatusBadge`, and Vecalss token surface
  contracts for the header, count-bearing status filters, cards, and empty
  state. The route opts into the page-scoped floating reference sidebar.
- Interaction: status controls filter published/draft Tryouts with counts;
  search keeps its existing behavior; no-match state offers `Hapus filter`;
  create and Tryout links remain unchanged.
- Verification: authenticated ego-browser QA passes at desktop and 390px mobile
  widths, including status filtering, search no-match/reset, sidebar collapse,
  and mobile Sheet body-scroll locking. Focused ESLint and `git diff --check`
  pass. Repository `tsc` remains blocked only by the preserved invalid
  `tmp/reference/res1` Base44 prototype.
- Follow-up overflow fix: the reference-styled collapsed rail now renders an
  opt-in compact `BrandMark` that fits its 30px content slot; expanded desktop
  and mobile Sheet states keep the full lockup. Live geometry reports zero
  sidebar child overflow.
- Scope: no student pages or other mentor/Kapten/admin routes were changed;
  the Tryout builder/editor remains owned by its existing workflow.

## First mentor dashboard adoption (2026-08-28)

- Objective: adopt the extracted reference dashboard language on one bounded
  non-student role surface while preserving existing role-shell infrastructure.
- Target: `/mentor/dashboard` was selected because it is outside the active
  Bank Soal, Materi, Tryout, and account-switcher work owned by other agents.
- Commit: `3777553` (`feat: adopt dashboard components on mentor home`).
- Files: `modules/mentor/MentorDashboardPageModule.tsx`,
  `components/dashboard/reference-dashboard-primitives.tsx`,
  `components/dashboard/reference-dashboard-tokens.ts`, and
  `scripts/test-mentor-dashboard-ia.ts`.
- Decision: keep `MentorWorkspaceShell` for breadcrumbs, search, account menu,
  ScrollArea, sidebar, and navigation guards. The extracted layer is used for
  the dashboard content only: header, stat cards, activity feed, task cards,
  surface, and empty state.
- Decision: recent resources remain individually actionable through linked
  activity titles; scheduled resources remain linked task cards. Content status
  labels are localized for mentor surfaces.
- Decision: `/mentor/dashboard` opts into a page-scoped reference sidebar
  appearance—floating Vecalss-tokenized rail, mint active navigation, 44px
  targets, and a desktop collapse affordance—while preserving the existing
  Sidebar/Sheet primitives. Other Kapten pages remain on the default shell.
- Files for the sidebar adoption: `modules/mentor/MentorDashboardPageModule.tsx`,
  `modules/mentor/components/mentor-sidebar.tsx`, and
  `modules/mentor/components/mentor-workspace-shell.tsx`.
- Verification: `pnpm test:mentor-dashboard-ia` passes; focused ESLint,
  Impeccable detector, and `git diff --check` pass. Authenticated ego-browser
  visual QA passes at desktop and 390px mobile widths, including collapse,
  mobile Sheet open/close, active navigation, and dashboard data states.
  `pnpm build` compiles the adopted dashboard and stops at the pre-existing
  `mdx-components.tsx` anchor/ref mismatch. Full lint/typecheck remain blocked
  by preserved `tmp/reference/res1` diagnostics.
- Next: review this bounded sidebar adoption before approving another
  mentor/Kapten/admin surface; keep student pages out of scope.

## Reference dashboard component extraction (2026-08-27)

- Objective: extract the reusable design language from `tmp/reference/res1`
  before any role-page rollout; student dashboard/pages remain out of scope.
- Branch/commit: `main` / `de0189c` + `6881d48` (reference dashboard
  extraction and follow-up hardening).
- Files: `components/dashboard/index.ts`, token contracts, responsive shell,
  primitives, and fixture-only preview composition.
- Decision: translate the reference's soft raised/inset geometry into existing
  Vecalss tokens and Phosphor icons. The shell accepts rendered icon nodes to
  preserve a safe server-to-client RSC boundary.
- Verification: focused ESLint passes; Impeccable detector returns `[]`;
  production compilation reaches TypeScript then stops on the pre-existing
  `mdx-components.tsx` anchor/ref mismatch; repository lint/type checks also
  report the preserved invalid Base44 prototype under `tmp/reference/res1`.
- Review boundary: no existing student, mentor, Kapten, or admin page was
  changed. Next action is a route-specific preview and explicit selection of
  one bounded non-student adoption.

## Current Tryout direct-only question authoring (2026-08-25)

- `f21d058` simplifies the Tryout Build surface to one source path:
  `Pilih langsung`, Bank Soal selection, and a question checklist.
- CAT mode/rules, alternative source modes, assembly picker/preview, mock
  panels, and direct-question reordering controls are removed from the UI.
  New sections default to randomized delivery and the save boundary always
  sends `shuffleItems: true`.
- Existing persisted package/CAT fields remain typed and server-compatible for
  legacy data, but no longer have an authoring selector or CAT rules surface.
- Configure Sections now has one footer button, `Selanjutnya`, which saves and
  advances without an icon; the unused participant-preview dialog is removed.
- Focused direct-question, simplified-authoring, workspace contract tests,
  TypeScript, focused ESLint, and `pnpm verify` pass. Preserve unrelated dirty
  package/admin files in the worktree.
- `8884f20` collapses Review & Publish to a single summary view: no Readiness or
  Published versions inner tabs/checklist cards, title/description plus all
  Section durations, and one `Terbitkan Tryout` primary action. The sticky
  footer no longer duplicates publish, and legacy `workspace=publish` deep links
  normalize to `review`.
- Browser semantic QA confirms zero inner tab roles, no readiness/version copy,
  seven Section durations, one publish button, and no footer buttons on the
  configured draft Review & Publish route. Full `pnpm verify` passed.
- `9befe2a` removes the phase intro card, inline `Perubahan belum disimpan`
  banner, and the dividers below the back control/above draft actions. Build
  now renders title-only `Informasi dasar` directly above `Pilih langsung`,
  with duration and participant instructions stacked vertically; the repeated
  question-source lead-in is gone. Review no longer renders an empty draft
  footer. Focused workspace/direct-question contracts, TypeScript, full
  `pnpm verify`, and authenticated desktop browser QA pass. Preserve the
  SectionRail and Identitas Tryout header regions.

## Current Tryout gated lifecycle closeout (2026-08-24)

- Lifecycle refactor is implemented in `1001677` plus workflow projection
  commits `697d360` and `9b6f37a`. Draft mode exposes only Build/Review &
  Publish, with Overview → Configure Sections → Readiness & Publish gating;
  published mode exposes Delivery → Operations → Results and hides authoring.
- Follow-up `848fd78` removes the out-of-mode lifecycle cards from the visible
  roadmap while retaining in-mode readiness locks. Authenticated ego-browser
  QA confirmed draft `Build`/`Review & Publish` and published
  `Delivery`/`Operations`/`Results` at desktop and 390px mobile widths.
- Follow-up `82733ee` makes draft navigation `Overview` → `Build` → `Review &
  Publish`, removes inner tabs from the single-area Build phase, and keeps only
  the auto-saving `Selanjutnya` footer action without a right-arrow icon.
  Authenticated ego-browser QA confirmed one footer button, zero inner tab
  lists, and no mobile horizontal overflow.
- Follow-up `bdb44a4` removes the workspace title, description, status badges,
  and authoring-mode copy, leaving only an accessible icon-only chevron-back
  control above the lifecycle roadmap. Authenticated desktop/mobile ego-browser
  QA confirmed the old header copy is absent and the back control has no visible
  text or horizontal overflow.
- `lib/tryout/workflow-projection.ts` is the pure lifecycle predicate module.
  The operations DTO carries phase/gate/session identifiers only; it does not
  cross the immutable AssessmentRelease/Bank Soal payload boundary. Historical
  opened/release-bound/attempt evidence keeps Operations available after close;
  Live is selected-session runtime eligibility; Results is global from closed
  or terminal/scored activity.
- Header Preview/Save/Review actions were removed. The sticky draft footer owns
  save/continue/publish, with Save/Discard/Stay navigation protection; the
  Configure Sections footer exposes only the primary `Selanjutnya` action.
  Published context owns title/description-only Edit details and
  **Buat draf perubahan** with `parent` lineage; Results uses `?session=` and
  Live receives the normalized selected session.
- Documentation is current in `docs/tryout-gated-workflow-refactor-plan.md`
  and `docs/tryout-creation-guide.md`; older screenshots are labeled as
  historical references.
- Focused workflow/authoring/live-result/pool/direct-question contracts,
  focused ESLint, TypeScript, and full `pnpm verify` pass. Authenticated
  browser QA remains to be rerun after unrelated concurrent admin-preview dirty
  files settle. Preserve those dirty files and do not reset the worktree.
- Known convergence item: the operations DTO intentionally fails closed for
  editable draft readiness because it does not carry the complete editable form;
  the builder currently uses its existing local readiness checks for draft
  unlocks. A future server edit/readiness DTO should feed the same stable issue
  codes and field targets into the canonical projection.

## Current AS-04 invitation-picker closeout (2026-08-23)

- Dedicated Kapten invitation picker is complete at `a72d5fd` plus `5c422ac`.
  It adds owner-scoped safe student search, selected-session threading,
  required audit reason, idempotent invitation, and authoritative refresh in
  the existing Tryout Participants workspace.
- The refresh boundary applies `toTryoutWorkspaceView`, so hidden participant
  scores are nulled and session attempts/release/integrity metadata are removed
  before the browser receives the response. Search/selection callbacks are
  invalidated while inviting; combobox/listbox and required-field semantics
  are explicit.
- Fresh independent review PASS:
  `artifacts/reviews/as04-invitation-picker-ui-followup-review-20260823`.
  Focused invitation/participant/live contracts, focused ESLint, diff-check,
  Impeccable detector `[]`, and authenticated ego-browser desktop/mobile QA
  pass. Lint/build pass with 0 errors and 459 baseline warnings.
- Full `tsc`/`pnpm verify` stop only on the unrelated concurrent
  `scripts/test-admin-student-preview-surfaces.ts` fixtures missing
  `ProcessEnv.NODE_ENV`; no invitation-picker file is implicated. Preserve
  all six concurrent dirty files and do not stage them.

## Current AS-07 realtime closeout / AS-06 Kuis handoff (2026-08-23)

- AS-06 durable Kuis assembly binding is complete at `047d5d7`, `331b7c7`,
  `4791020`, `a892ec4`, and `394e240`. The final independent review is PASS:
  `artifacts/reviews/as06-kuis-assembly-binding-final-review-394e240-20260823`.
- Prisma migrations
  `20260823100000_add_standalone_quiz_assembly_binding` and
  `20260823110000_pin_kuis_assembly_version_identity` are applied to the
  authorized development database; `prisma migrate status` is current.
  Set/Pool/Blueprint bindings are durable and server-owned; CAT Pool,
  multi-Bank, wrong-Subtest, stale revision/digest, forged direct-plus-
  assembly, and invalid legacy rows are rejected or hidden. Fixed Sets use
  immutable version snapshots, including through package draft edits.
- Persisted detach updates the server before clearing local state, retains
  materialized canonical items, and preserves unrelated unsaved editor edits.
  Direct/fixed Kuis behavior remains compatible. Focused contracts, Prisma
  validation, TypeScript, focused ESLint, diff-check, and `pnpm verify` pass.
- Authenticated ego-browser QA covered Ready Pool attach, reload, detach,
  direct-picker recovery, mobile 390px layout, and dirty-state preservation.
  Impeccable detector returned `[]`; the post-detach audit found no P0/P1
  issue. The broad AssessmentRelease invariant remains a known baseline
  failure caused by the preserved dirty `lib/admin/student-preview-tryout.ts`.
- Preserve the three unrelated dirty files exactly:
  `lib/admin/student-preview-tryout.ts`,
  `prisma/migrations/20260822110000_admin_student_preview_tryout_restart/migration.sql`,
  and `scripts/test-admin-student-preview-tryout.ts`.
- AS-07 realtime hardening is complete at `d8eb288`, `59d090e`, and `ba1291c`.
  Disconnect start/reconcile is authenticated, idempotent, audit-backed, and
  bound to the originating run; legacy/unbound/cross-run markers fail closed.
  Authoritative expiry closes a verified open marker once with bounded elapsed
  time and a terminal audit, without mutating score/release state. Terminal
  Live states win over stale markers.
- Operations refresh discovers candidates outside a transaction and syncs each
  candidate in a short owner-rechecked transaction with one shared timestamp,
  preventing refresh/start/revoke deadlocks. Live polling is visibility-aware,
  15-second, in-flight guarded, capped after three failures, and manually
  retryable. DTO/release/score sanitization remains intact.
- Focused realtime/live/authoring/participant contracts, TypeScript, focused
  ESLint, diff-check, and `pnpm verify` pass; authenticated ego-browser QA
  passed at 1512px and 390px; Impeccable detector `[]`; final review PASS:
  `artifacts/reviews/as07-realtime-hardening-final-independent-review-20260823`.
- The dedicated invitation-picker closeout above is complete. Continue with
  the next approved backlog slice; do not reopen AS-08 or alter the protected
  admin-preview files.

## Historical AS-07 Live delivery/result closeout (2026-08-23)

- AS-07 is complete at `ea0d296` + `d437043` + `6fd1794`. The final review
  artifact `reviews/as07-live-delivery-result-workspaces-final-fixup-review-
  20260823` is PASS.
- The existing Tryout workspace now exposes server-owned Live, Attempts, and
  Results projections. Participant score fields are sanitized until the exact
  admission/attempt result is score-visible; release payloads and raw session
  attempts remain out of the client boundary.
- Final UI polish fixed deep-linked mobile tab visibility and nested page
  landmarks on Attempt/Participant detail routes. Impeccable audit:
  `reviews/as07-live-delivery-result-workspaces-impeccable-audit-20260823`,
  18/20 with no P0/P1 findings. Authenticated ego-browser QA passed at
  1512px and 390px.
- At this initial projection checkpoint, disconnected lifecycle writers and
  expiry persistence were intentionally deferred; the later realtime-hardening
  section above supersedes that bounded deviation.
- Preserve the unrelated dirty files:
  `lib/admin/student-preview-tryout.ts`,
  `prisma/migrations/20260822110000_admin_student_preview_tryout_restart/migration.sql`,
  and `scripts/test-admin-student-preview-tryout.ts`.
- This historical checkpoint preceded the durable Kuis binding and realtime
  hardening closeouts recorded above; AS-08 remains closed unless a new defect
  appears.

## Current AS-06 closeout / AS-07 pickup (2026-08-23)

- AS-06 Ticket 6 is complete for the intentionally narrowed Tryout-only
  boundary. Commits `4c85278`, `617735f`, and `01e4078` implement Ready
  Set/Pool/Blueprint/CAT Pool attachment, exact-version preview, persisted
  bridge wiring, server/UI compatibility and Review gates. Final fresh review:
  `reviews/as06-assembly-attachment-integration-final-fresh-review-01e4078-20260823`
  — PASS.
- Ticket 7 is complete. Migration `20260822130000_add_random_assembly_schema`
  was made replay-safe for its one-time Ready metadata backfill in `cb49aac`.
  With explicit development approval, the configured database was reset and
  reseeded; all 31 migrations are up to date and `pnpm db:verify-demo` passes.
- Focused AS-06/AS-05/direct/CAT/package/release contracts, TypeScript,
  focused ESLint, `git diff --check`, `pnpm verify`, and authenticated
  ego-browser task space 20 desktop/mobile QA pass. The broad
  `test:assessment-release-invariants` failure remains limited to the
  preserved dirty admin-preview source; the opt-in schema DB contract was
  skipped without `RANDOM_ASSEMBLY_SCHEMA_TEST_DATABASE_URL`.
- The disposable Pool fixture used for browser QA is development-only and was
  not added to application seed code. Preserve these unrelated dirty files:
  `lib/admin/student-preview-tryout.ts`,
  `prisma/migrations/20260822110000_admin_student_preview_tryout_restart/migration.sql`,
  and `scripts/test-admin-student-preview-tryout.ts`.
- Kuis assembly binding remains deferred to
  `artifacts/tickets/as06-kuis-assembly-binding`; existing Kuis direct/fixed
  behavior is not represented as completed assembly coverage.
- Next: start AS-07 Live delivery and result workspaces. AS-08's physical
  QuestionRevision/Ready lifecycle is already implemented under AS-02 and
  should not be reopened without a new defect.

## Current AS-07 kickoff (2026-08-23)

- Ticket artifact: `artifacts/tickets/as07-live-delivery-result-workspaces`.
- Implementation agent `6af221fe-77a2-46fa-927b-2234b52a0201` is dispatched
  with `traycer-implement` to extend the existing mentor Tryout workspace with
  Live, Attempts, and Results projections.
- Preserve ParticipantView, delivery-repository, AssessmentRelease, attempt,
  scoring, and result-release server boundaries. Focus/fullscreen events remain
  human-review signals only. Kuis assembly and AS-08 are out of scope.
- Protected dirty files remain untouched and unstaged; use ego-browser for
  authenticated desktop/mobile QA when implementation is ready.

## Current AS-06 Ticket 5 Handoff (2026-08-22)

- Objective: pin explicit CAT Pool candidates and canonical 2PL calibration
  parameters inside immutable Tryout AssessmentReleases.
- Implementation commits: `347cc37` (`feat: pin CAT Pool candidates in
  releases`), `e4bb17c` (CAT release contract), and `1ef8e85` (preserve mixed
  CAT Pool releases).
- Publish locks the Tryout aggregate, Ready CAT Pool version, sorted
  Question/Bank/current Revision/Subtest source rows, and sorted calibration
  rows. It revalidates revision identity/digest/provenance, active source
  scope, content/options/media, approved `2pl-canonical-v1`, finite positive
  parameters, and candidate count ≥ delivered count; exact-size pools pass.
- The release payload pins all CAT candidate snapshots and calibration
  metadata (calibration/source identity, digest, provenance, approval/model,
  difficulty/discrimination, and resolver version). Runtime reads the pinned
  payload only and retains existing information-maximizing selection,
  deterministic tie-breaks, no back-navigation/CBT fallback, and answer-first
  failure handling.
- Existing CAT Pool releases remain usable after calibration/source drift.
  Mixed CAT Pool + direct-CAT Tryouts skip mutable checks for the pinned CAT
  Pool sections and validate only direct/unpinned CAT candidates.
- Verification: CAT/random/repository/schema/direct/package/release
  contracts, TypeScript, focused ESLint, diff-check, and `pnpm verify` pass.
  `test:assessment-release-invariants` is blocked only by unrelated concurrent
  admin-preview edits. Migration 31 remains unapplied; no reset/reseed or live
  DB concurrency test was run.
- Fresh review artifact: `reviews/as06-cat-pool-release-pinning-fresh-review-
  20260822` — PASS after `1ef8e85`.
- Next: AS-06 Ticket 6 Kuis/Tryout assembly attachment and Review wiring,
  followed by Ticket 7 verification/QA. Do not deploy migration 31 or reset/
  reseed without explicit approval.

## Current AS-06 Ticket 4 Handoff (2026-08-22)

- Objective: resolve seeded Pool and Blueprint forms inside the immutable
  AssessmentRelease publish transaction.
- Implementation commits: `5311eda` (`feat: resolve seeded pool and blueprint
  releases`) and `2e0915c` (`fix: allow blueprint release materialization`).
- Pool resolution rereads every Ready candidate under deterministic aggregate →
  Ready version → source locks, rejects stale/archived/missing/non-Ready,
  duplicate, invalid content/media, wrong-Subtest, and shortage states, then
  applies `seeded-fisher-yates-v1` without replacement.
- Blueprint resolution uses current Ready questions in the immutable
  Bank/folder/category scope and active Section Subtest, partitions by
  Easy/Medium/Hard, and fails closed on exact quota shortage. Blueprint Ready
  versions intentionally carry no candidate item snapshots; the release
  transaction creates their physical TryoutItem bridge.
- Release payloads retain per-section mode, package/version, resolver, seed,
  requested/candidate/availability evidence, quotas/scope, resolved source
  IDs, and revision digests. Same explicit publication intent keys are
  deterministic; active release-bound sessions block seeded rematerialization.
- Final review artifact:
  `reviews/as06-pool-blueprint-release-resolution-final-review-20260822`.
- Verification: focused random assembly/repository/schema/direct/AS-05/
  package/release contracts, TypeScript, focused ESLint, `git diff --check`,
  and `pnpm verify` pass (0 errors, 459 baseline warnings, production build).
  Migration 31 remains unapplied to the configured database.
- Superseded by the Ticket 5 handoff above. Ticket 5 is complete; next is
  Ticket 6 attachment and Review wiring. Do not deploy migration 31 or
  reset/reseed without approval.

## Current AS-06 Schema Handoff (2026-08-22)

- Objective: continue the approved Pool-first flow into the random
  Pool/Blueprint/CAT assembly schema and immutable Ready revision boundary.
- Pool-first mock flow is approved and committed in `8deaad7`.
- Schema Ticket 2 is complete in `4f2dbd0` (`feat: add random assembly schema
  boundaries`). It adds the four assembly modes, conservative legacy
  provenance backfill, normalized Bank/folder/category scopes, quota rules,
  Ready metadata/digest transition guards, and AssessmentRelease assembly
  provenance fields.
- Database guards cover non-empty non-fixed scope, exact Blueprint quotas,
  fixed-mode child restrictions, old/new-parent Ready immutability, published
  revision release gating, package/version mode at Ready, and mode-specific
  Pool/Blueprint/CAT release provenance.
- `scripts/test-random-assembly-schema-db.ts` is an opt-in contract. Set
  `RANDOM_ASSEMBLY_SCHEMA_TEST_DATABASE_URL` to a disposable local database;
  it rejects use of the configured `DATABASE_URL` and does not run migrations.
- Verification: fresh replay of all 31 migrations in isolated PostgreSQL,
  static and DB schema contracts, package/release/AssessmentRelease/direct/
  Tryout/Pool contracts, Prisma validate/generate, TypeScript, focused ESLint,
  diff-check, and `pnpm verify` all pass. Lint remains at 0 errors with 459
  baseline warnings; production build completes.
- The migration is not deployed to the configured database; the configured
  database remains at its prior 30 applied migrations.
- Next: implement Ticket 3 repository commands, creator/shared-read access,
  Ready revision creation, and read-only Pool/Blueprint preview. Resolver
  algorithms and release integration remain later tickets.

## Current AS-06 Ticket 3 Handoff (2026-08-22)

- Objective: implement the server-only assembly draft/Ready revision boundary,
  creator/shared-read access, source readiness validation, and illustrative
  Pool/Blueprint preview after the approved mock flow and schema migration.
- Implementation commit: `9a1e306` (`feat: add random assembly repository
  workflow`).
- Repository: `lib/tryout/assembly-repository.ts` owns draft save/update,
  package aggregate locking, deterministic source locks, Ready snapshot
  creation, shared Ready reads, readiness reports, and temporary-seed preview.
  `lib/tryout/assembly-validation.ts` owns pure shape/quota/error/seed helpers;
  `modules/mentor/assembly-actions.ts` provides authenticated server actions.
- Draft lifecycle: package rows hold mutable candidate membership; the one
  current draft `ReusableQuestionPackageVersion` holds normalized Bank/folder/
  category scope and the mode rule. Ready transitions snapshot Pool/CAT/fixed
  candidate content/options into immutable version items. Blueprint Ready
  freezes scope/quota only and does not resolve a question list.
- Access: mutation commands require the package creator or `isAdmin`; Ready
  list/detail and preview reads are shared through the Kapten management action
  boundary. Existing Tryout package binding no longer filters published Ready
  revisions by creator, so a shared Ready asset can be selected by another
  Kapten without granting edit access.
- Validation: source Question, current Ready revision, digest, active/published
  Bank, active Subtest, duplicate identity, option cardinality/correctness,
  explanation, media readiness, CAT canonical `2pl-canonical-v1` calibration,
  scope/folder/category membership, quota, and candidate shortages are
  server-authoritative. Errors carry stable codes and details for Review/action
  consumers.
- Preview: reads only; it creates no assembly versions, TryoutItems,
  AssessmentReleases, sessions, attempts, or CAT runs. It generates a
  temporary seed and returns a replayable illustrative sample plus readiness
  blockers/availability counts. Blueprint preview uses current eligible Ready
  content but Ready creation does not resolve it.
- Verification: `pnpm test:random-assembly-repository`, schema/direct/AS-05/
  package/release/AssessmentRelease contracts, `pnpm exec tsc --noEmit
  --pretty false`, focused ESLint, `git diff --check`, and `pnpm verify` all
  pass (0 lint errors, 459 baseline warnings, production build complete).
- Database boundary: migration `20260822130000_add_random_assembly_schema` was
  replayed only in an isolated disposable PostgreSQL verification database;
  the configured database remains at 30 applied migrations. Do not run
  `migrate deploy`, reset, or reseed without explicit deployment approval.
- Out of scope and next: AssessmentRelease Pool/Blueprint resolution,
  release-owned seed/idempotency, CAT release pinning, physical materialization,
  and final Kuis/Tryout UI attachment remain Tickets 4–6.

### Planning record

- Objective: settle the product and persistence boundaries for random Pool,
  Blueprint, and CAT Pool assembly after the completed direct-pick/fixed-Set
  slice.
- Pool: explicit candidate membership and draw count; preview is illustrative;
  every explicit candidate is revalidated at publish, stale/archived/missing/
  non-Ready candidates block rather than being silently replaced, and one
  system-generated seed resolves one shared form per AssessmentRelease.
- Blueprint: one Section/one active Subtest; selected-Bank union with optional
  folder/category narrowing; exact total plus Easy/Medium/Hard quotas; shortage
  blocks publish with no fallback. Kuis keeps its existing one-Bank boundary,
  so multi-Bank Blueprint scopes are Tryout-only until explicitly expanded.
- CAT Pool: explicit calibrated candidates, canonical `2pl-canonical-v1`
  approval for every candidate, candidate count at least delivered count, and
  release-pinned calibration parameters; CAT remains Tryout-only.
- Lifecycle/access: named draft plus immutable Ready revisions; all Kapten can
  read and attach Ready revisions, while only the creator edits or revises a
  definition.
- Persistence: extend the existing package aggregate with normalized
  mode/scope/rule definitions; AssessmentRelease owns final Pool/Blueprint
  resolution and CAT candidate/calibration snapshots. Publish idempotency
  reuses the original seed and digest for the same publication intent.
- Durable artifacts:
  - `artifacts/as06-random-assembly-core-flow`
  - `artifacts/as06-random-assembly-technical-plan`
  - follow-up recorded in `artifacts/as06-direct-question-picks`
- Verification: the planning pass preceded the approved Pool-first mock flow
  and schema implementation. Its boundaries are now represented by the
  committed Ticket 2 migration and the ticket artifacts.
- The planning gate was satisfied; the next pickup is Ticket 3 repository and
  preview work.

## Current AS-06 Handoff (2026-08-22)

- Objective: add direct question picks and an optional inline fixed Set path to
  the AS-05 Tryout authoring workspace.
- Approved scope: any non-archived Bank Soal filtered by the active Section
  Subtest; direct picks and saved fixed Sets are mutually exclusive per Section.
  Random Pool, Blueprint, and CAT-pool assembly authoring are deferred.
- UI: Questions now exposes “Pilih soal langsung” and “Gunakan Set Soal siap”.
  Direct mode supports Bank search, subject-filtered Ready questions, cross-bank
  selection, ordering/removal, pagination, and selected-source summaries.
- Server boundary: `TestInput.directQuestions` carries source question ID,
  current revision ID, and content digest. The repository locks Question and
  Bank rows, revalidates Ready/options/media/subtest/lifecycle state, rejects
  stale selections and duplicates, then snapshots direct items with
  `packageCode: "direct"`. Revision ID and digest are required, and missing or
  stale values are rejected. Publish requires explanation/media; direct CAT
  also requires approved canonical 2PL calibration.
- Release/delivery boundary: `61abfbb` makes the shared
  `assertTryoutReleaseEligibility` gate accept direct physical snapshots as an
  alternative to a published Set, validates direct provenance and Subtest, and
  applies the canonical CAT/2PL check to direct items before a session opens.
- Readback/catalogue: direct Tryout items round-trip with prompt, Bank label,
  revision/digest, explanation/media readiness, and CAT readiness; catalogue
  readiness counts direct sections as sourced.
- No schema or migration change was needed: existing `TryoutItem` snapshot
  fields and package-version bridge support the first slice.
- Verification: `test:tryout-direct-question-picks`,
  `test:tryout-authoring-workspace`, package/release invariants, TypeScript,
  focused ESLint, `pnpm verify` (0 errors; 459 baseline warnings), and
  `git diff --check` passed. Impeccable detector advisories were reduced to
  zero for the changed type-ramp values.
- Implementation commits: `9e0fafe` (authoring UX and snapshots),
  `61abfbb` (post-publish direct delivery eligibility and required digest
  hardening), and `c8a6d05` (required revision identity). Independent
  finish-review recheck is PASS against `c8a6d05`.
- Durable ticket: `artifacts/as06-direct-question-picks`.
- Recommended pickup: see the Current AS-06 Random Assembly Planning Handoff
  above; the direct/fixed-Set slice remains complete.

## Current AS-05 Handoff (2026-08-22)

- Objective: turn `/mentor/tryout` into one mentor-facing Tryout authoring
  workspace with Basics, Sections, Questions, Rules, Schedule & akses, Results,
  Review, and Publish areas.
- Implementation commits: `1ea7b3d` (`feat: consolidate tryout authoring
  workspace`), `c22ecb2` (tablet containment), `17a9d53` (`fix: close AS-05
  workspace review gaps`), `a1bca11` (no-argument draft-save regression
  guard), and `72b95e9` (preserve the shell-owned `main` landmark with a
  structural contract assertion). No schema or migration change was needed;
  all 30 migrations are applied.
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
  readiness while publish remains server-validated. Schedule & akses remains
  mounted across workspace tabs so policy form state is not discarded.
- Review/Publish now blocks invalid duration, missing source content or
  explanations, non-ready media, duplicate source questions, incomplete CAT
  pools/2PL calibration, and schedule conflicts before the server action runs.
- Save defaults to `draft`; only the explicit publish confirmation sends
  `published`. Historical AssessmentRelease state is labeled as the last
  release until a draft is published.
- Compatibility: the dynamic Tryout route preserves legacy `authoring`,
  `policy`, `sessions`, `participants`, and `operations` query values while
  adopting the eight-area vocabulary.
- Verification: `pnpm test:tryout-authoring-workspace`, TypeScript,
  `git diff --check`, focused ESLint, full `pnpm verify`, and the Impeccable
  detector passed. Authenticated ego-browser QA passed on desktop, tablet, and mobile:
  all tabs, query persistence, draft switching, preview copy, seven subjects,
  CAT rules, release notice, locked published Tryout, policy state persistence,
  review gating, one-main landmark, and no 390px/900px body overflow.
- Fresh final review: PASS against `72b95e9`; artifact:
  `reviews/as05-tryout-authoring-workspace-final-72b95e9-review-20260822`.
- Recommended pickup: start AS-06 (direct question picks and optional Set/Pool
  assembly). Keep the existing
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

- Start the deferred durable Kuis assembly binding implementation and keep
  the protected admin-preview files untouched.

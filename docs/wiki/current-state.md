# Current state and handoff

> Snapshot recorded 31 August 2026. This page is a dated handoff; re-check
> `git status`, the source tree, and the harness tracking files before starting
> another implementation slice.

## Completed or confirmed recent slices

| Slice | Current evidence | Status and boundary |
| --- | --- | --- |
| Vera AI admin control plane | `feat-022`–`feat-028`; admin AI route family and focused control-plane contracts | Backend/API capabilities and focused contracts are present. The canonical `/admin/ai/policies` page now loads actor-scoped metadata server-side and renders `modules/admin/AiPolicyPageModule.tsx`, whose draft, validation, preview, approval, scheduling, activation, rollback, and retention controls call the backend policy endpoints. Browser verification remains a separate permission-gated step. |
| Mentor reference rollout | `feat-021`; mentor dashboard, Tryout, Quiz, Materi, Media, Settings, Packages, and Bank Soal adapters | Complete: document-flow scrolling and bounded pane exceptions are intentional; dense table/list internals were preserved. Browser QA for the expanded rollout was deferred. |
| Kuis assembly binding | Existing `feat-017` evidence and migrations `20260823100000_*` / `20260823110000_*` | Complete: durable Set/Pool/Blueprint identity and server-owned Ready validation; CAT Pool remains rejected for Kuis. |
| Kuis versioning contracts | Commit `13497c9` and `scripts/test-kuis-versioning.ts` | Complete contract foundation: semantic digest, lifecycle, editor/catalogue/student/results projections, and schedule transitions. Persistence/runtime delivery/UI cutover remains a separate follow-up. |
| Kuis editor parity | Commit `4eaae2a`, `pnpm test:kuis-ui-first-workspace` evidence | Complete focused parity slice: Bank Soal-like inventory, issue markers, add control, preview switch, and editor action treatment. |
| Vera regression alignment | Commit `3746e8d` | Complete focused Sprint 5 test alignment and revision-FK fixture restoration. |
| Test-suite manifest | Commits `c47d620` and `5f18555` | Complete: package scripts expose `scripts/test-*` files and the manifest test checks registration and scope. |
| Operational primitive migration | P1/P2 implementation confirmed complete by the Design Consistency Review agent after explicit user confirmation | P1 selects/tables, P2 onboarding and field wrappers, compact/full-width tab semantics, semantic operational badges, and shared `ModeCardTabs` are implemented. Rich searchable selectors and other custom chips remain deferred. Guarded TypeScript, targeted ESLint, focused media/mentor/authoring checks, static sweeps, and diff-check pass; browser QA was skipped. |

## Verification ledger

The most recent confirmed operational-primitive closeout evidence is:

- guarded TypeScript check: pass;
- targeted ESLint: pass;
- focused media-domain, mentor package/catalogue, Tryout authoring, and empty
  value/form smoke contracts: pass;
- static native-select, raw-table, and migrated operational-badge sweeps: pass;
- `git diff --check`: pass;
- broader admin-import UI contract: reaches its pre-existing English-copy
  assertion (`No accounts were changed`), unrelated to the migration;
- browser verification: not run because the required explicit permission was
  not granted for this slice.

This documentation task does not claim a fresh Prisma migration status, full
production build, or browser result. Run those through the guarded workflow
when the next implementation owner needs them.

## Working-tree ownership

The shared tree contains product changes from several completed or closing
agent sessions, including Vera AI, admin screens, mentor surfaces, media, and
design primitives. This wiki and harness refresh must remain isolated to:

- `docs/wiki/*`;
- `_harness/memory/project.md`;
- `_harness/tracking/feature_list.json`;
- `_harness/tracking/progress.md`;
- `_harness/tracking/session-handoff.md`.

Do not stage unrelated dirty product files when committing this documentation
slice.

## Follow-up queue

1. If Kuis versioning is promoted beyond its contract foundation, add the
   persistence, server mutation, runtime participation, and historical-results
   cutover behind the existing digest/lifecycle contracts.
2. Obtain explicit browser permission before validating the completed
   operational-primitive migration (onboarding, admin mode-card dialogs, and
   Tryout Delivery) or any deferred mentor rollout route. Record routes, role,
   and checklist in the handoff.
3. Re-run the broader admin-import contract after its independent English-copy
   baseline is addressed; keep the baseline distinction in the evidence.
4. Re-check configured-database migration status before any schema mutation;
   the wiki records migration history, not an assertion that every local
   database is current.
5. Continue the deferred rich-searchable-selector and custom operational-chip
   audit only as a separate behavior-preserving migration batch.

## Restart checklist

1. Read [`AGENTS.md`](../../AGENTS.md), then the current
   [`_harness/tracking/session-handoff.md`](../../_harness/tracking/session-handoff.md).
2. Run `git status --short --branch` and preserve existing ownership.
3. Read [`_harness/tracking/feature_list.json`](../../_harness/tracking/feature_list.json)
   and choose one explicit unfinished feature.
4. Route to the relevant wiki page and source boundary before editing.
5. Use the shared resource guard and update the handoff before yielding.

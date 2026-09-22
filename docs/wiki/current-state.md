# Current state and handoff

> Snapshot recorded 22 September 2026 at `4bc2d93` (`fix(vera): wire v2
> admission and provider reconciliation`). Re-check `git status`, the source
> tree, migration status, and harness tracking before starting another
> implementation slice. This page describes tracked source at that commit;
> it does not absorb concurrent uncommitted product edits.

## Implemented or materially advanced

| Area | Current source evidence | Status and boundary |
| --- | --- | --- |
| Vera learner MVP | [`docs/vera-ai/mvp.md`](../vera-ai/mvp.md), `lib/vera-ai/contracts.ts`, `context-pack.ts`, `studio-contracts.ts`, `scripts/test-vera-mvp-contracts.ts` | Enabled features are `chat`, `review`, `analysis`, and `route`; context/history budgets and typed outputs are enforced. `ptn`, `summary`, and `drill` remain explicitly feature-disabled, and no provider-backed apply registry is enabled. |
| Vera conversation lifecycle | `modules/vera-ai/VeraAiPageModule.tsx`, `lib/vera-ai/learner-service.ts`, `app/api/vera-ai/conversations/` | Session titles are renamed inline from the `Sesi` sidebar. Sessions can be reversibly archived/restored; delete continues through the idempotent lifecycle purge path. Local development ignores the paid provider flag and uses the gated free POC or local mock path. |
| Vera credit/USD admission | `lib/vera-ai/quota-v2.ts`, `billing.ts`, `admission-service.ts`, `prisma/schema.prisma` | Daily/ISO-week/month windows, weighted credits, USD-micro exposure, monetary debt, idempotent reservation settlement, and append-only billing corrections are implemented. The v2 ledger is scheduled for `2026-09-30T17:00:00Z`; before then the policy resolver selects `vera_quota_v1`. |
| Vera paid provider | [`docs/vera-ai/mvp.md`](../vera-ai/mvp.md), `lib/vera-ai/provider.ts`, `certifiers/`, `scripts/test-vera-paid-provider.ts` | Release-gated OpenRouter direct routing to Relace and `deepseek/deepseek-v4-flash-0731`, with privacy/max-price/certifier evidence checks and generation-cost reconciliation. A live flag or API key alone is insufficient. |
| Vera reconciliation worker | `workers/vera-ai-reconciliation-worker.ts`, `package.json` | Lease-based claims, bounded concurrency, generation evidence polling, conservative unknown settlement, and correction lineage are implemented. Deployment/readiness and secret configuration still need environment-specific verification. |
| Vera admin control plane | `/admin/ai/*`, `/admin/ai/policies`, `modules/admin/AiPolicyPageModule.tsx`, `/api/admin/ai-policy/*` | The canonical policy page is wired to actor-scoped backend metadata and draft/validate/preview/approve/schedule/activate/rollback/retention endpoints. Browser verification remains permission-gated. |
| Admin-import worker | `workers/admin-import-worker.ts`, `lib/admin/imports/runtime.ts`, `dispatch.ts` | Readiness/heartbeat, bounded BullMQ dispatch, stale-claim/queue-job repair, row-claim reaping, and retention cleanup are implemented; worker credentials and disposable smoke URLs still require an approved environment. |
| Kuis versioning | `StandaloneQuizVersion`, Kuis version migrations, `lib/quiz/repository.ts`, `lib/quiz/versioning-runtime.ts` | Persistence and default runtime cutover are now in place. Draft revision checks, semantic digests, idempotent publication, active/superseded versions, version-scoped items/participations, and historical attempt pinning are implemented. `KUIS_VERSIONING_CUTOVER=disabled` is an explicit rollback switch. |
| Tryout lifecycle | `AssessmentRelease`, delivery/admission/attempt/result repositories | The release boundary remains immutable and deterministic: Ready assembly → release → admission/session → seven runs → scoring/result release. Preview reads and explicit preview restarts remain separate. |
| Question-bank and commerce schema | September migrations for multiple-choice questions, CBT-only retirement, question Materi, auto-publish, affiliator attribution, and purchase evidence | The schema/migration path is present in the tracked tree. Verify the configured database and the owning feature contracts before calling these slices operationally complete. |
| UI consistency | Recent mentor/admin commits and the P1/P2 operational-primitive closeout | Shared select/table/wrapper/tab/badge/mode-card conventions are present; rich searchable selectors and custom operational chips remain intentionally deferred. Browser QA was not run for that closeout. |

## Verification ledger

The repository exposes focused evidence for the latest boundaries:

- Kuis storage/runtime: `test:standalone-quiz-version-storage`,
  `test:standalone-quiz-version-runtime`, `test:kuis-versioning`, and
  `test:assessment-answer-contract`;
- Vera MVP: `test:vera-mvp-contracts`;
- Vera billing/worker: `test:vera-billing-v2`,
  `vera:reconciliation-worker:check`;
- Vera paid provider: `test:vera-paid-provider`;
- Tryout release/scoring/participant contracts and the existing admin AI
  control-plane suite;
- focused operational-primitive, mentor, media, authoring, and suite-manifest
  contracts documented in [`development-and-verification.md`](development-and-verification.md).

Guarded contract evidence recorded on 22 September 2026:

- **Passed Kuis version contracts:** `test:kuis-versioning`,
  `test:standalone-quiz-version-storage`,
  `test:standalone-quiz-version-runtime`, `test:assessment-answer-contract`,
- plus the independent `test:random-assembly-release` assessment-release
  contract.
- **Kuis source/contract drift:** `test:kuis-ui-first-workspace` stops at
  `scripts/test-kuis-ui-first-workspace.ts:61` because the expected
  create-mode `useState(mode === "create" && hasQuizDraftContent(initialForm))`
  shape does not match the current editor call, which also passes
  `pristineSubjectCode`. `test:kuis-assembly-binding` stops at
  `scripts/test-kuis-assembly-binding.ts:101` because the current editor does
  not contain the asserted `Buka Bank Soal` copy. No source or test fix was
  made during this verification pass.
- **Passed Vera contracts:** `test:admin-ai-control-plane` (30 checks),
  `test:vera-mvp-contracts`, `test:vera-billing-v2`,
  `test:vera-paid-provider` (6 checks), and
  `vera:reconciliation-worker:check` (worker typecheck).

Every command was launched serially through
`_harness/resource-guard.sh run -- rtk pnpm ...`; the failures were
source/contract drift, not resource or environment blockers. This run did not
include full lint/build, Prisma status or migrations, live worker execution,
or browser verification. Passing source contracts do not prove that a
configured database has applied the 67 migration files, that provider secrets
and release evidence are deployed, or that the live UI renders correctly.

## Shared-worktree ownership

The tree is shared with concurrent product agents. At snapshot time, the
uncommitted paths observed outside this wiki were:

- `modules/mentor/KaptenQuestionBankBuilderPageModule.tsx`;
- `modules/mentor/KaptenTryoutBuilderPageModule.tsx`;
- `modules/mentor/KaptenTryoutCataloguePageModule.tsx`;
- `modules/mentor/KaptenTryoutSettingsPageModule.tsx`;
- `scripts/test-tryout-authoring-workspace.ts`;
- `public/mascott.webm` and the untracked `public/mascot.webm`.

This refresh edits only `docs/wiki/*`. Do not stage or reset the paths above;
they belong to other work. Harness memory/tracking files were not changed by
this wiki update.

## Remaining work map

1. **Environment and database proof.** Run the guarded Prisma status command
   against the intended disposable/staging database, then apply or verify the
   current migration set as an explicitly owned operation. Do not infer this
   from migration filenames.
2. **Vera worker readiness.** Supply the deployment-owned HMAC/encryption,
   OpenRouter, generation-evidence, Redis, and disposable-test settings as
   appropriate; run the worker typecheck and a controlled one-cycle/readiness
   check. Confirm logs contain only operational counters, not payloads.
3. **Paid-provider release operations.** Revalidate the manifest, certifier
   artifact, privacy evidence, price snapshot, and expiry before enabling live
   traffic. Keep the provider disabled when any evidence is missing.
4. **Browser acceptance.** Request explicit permission with routes, role, and
   checklist before checking `/admin/ai/policies`, `/vera-ai`, Kuis, Tryout
   delivery, or the deferred mentor rollout surfaces. No browser result is
   implied by this page.
5. **Known deferred slices.** Keep the admin-import English-copy baseline,
   rich searchable-selector/custom-chip migration, and any feature-specific
   UI polish separate from the completed contracts above.

## Restart checklist

1. Read [`AGENTS.md`](../../AGENTS.md) and the current
   [`_harness/tracking/session-handoff.md`](../../_harness/tracking/session-handoff.md).
2. Run `git status --short --branch` and preserve shared ownership.
3. Read [`_harness/tracking/feature_list.json`](../../_harness/tracking/feature_list.json)
   and choose one explicit unfinished feature.
4. Route to the relevant wiki page and source boundary before editing.
5. Use the resource guard for all Node, pnpm, Prisma, test, build, and worker
   commands; record new evidence here only after it is actually observed.

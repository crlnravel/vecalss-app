# Current state and handoff

> Snapshot recorded 2 November 2026, after the Vera OpenAI rebuild on
> `feat/vera-openai`. Re-check `git status`, migration status, and harness
> tracking before another implementation slice. This page does not absorb
> concurrent uncommitted product edits.

## Implemented or materially advanced

| Area | Current source evidence | Status and boundary |
| --- | --- | --- |
| Vera AI | [`docs/vera-ai/README.md`](../vera-ai/README.md), `lib/vera/`, `modules/vera/`, `app/vera-ai/`, `app/api/vera/` | Streamed chat on OpenAI with three effort levels, `@` sources, sessions (rename, archive, delete, and a title after the first answer), and Studio with three tools that save documents. Real answers need `OPENAI_API_KEY`. Built on `feat/vera-openai` and not pushed. |
| Vera credit ledger | `lib/vera/ledger.ts`, `usage-tracker.ts`, `credits-shared.ts`, `windows.ts` | Each run reserves credits before the model is called and settles them when it ends. Day, week, and month limits, the burst and busy limits, and the monthly USD cap are checked when the reservation is taken. |
| Vera admin cost view | `/admin/ai`, `/admin/ai/usage`, `lib/admin/ai-usage/summary.ts` | Requests, credits, and USD (with IDR) for the day and the month, and a per-student table with each limit's usage. It shows counts and costs, never message text. Not yet checked in a browser. |
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
- Vera AI: the `test:vera-*` suites listed in
  [`development-and-verification.md`](development-and-verification.md), and
  `test:vera-obscura-smoke` for the browser path;
- Tryout release/scoring/participant contracts;
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

Every command was launched serially through
`_harness/resource-guard.sh run -- rtk pnpm ...`; the failures were
source/contract drift, not resource or environment blockers. That pass did not
include full lint/build, Prisma status or migrations, live worker execution,
or browser verification. Passing source contracts do not prove that a
configured database has applied the 90 migration folders, that provider secrets
are deployed, or that the live UI renders correctly.

### Vera rebuild evidence (2 November 2026)

Observed in this pass, on the local dev database (`127.0.0.1:55432`), with the
OpenAI API never called:

- Passed: `tsc --noEmit`, and ESLint on every Vera, admin, and test file the
  pass touched.
- Passed: `test:vera-studio`, `test:vera-admin-usage`, and `test:vera-model`
  on their final code. `test:vera-chat`, `test:vera-ledger`,
  `test:vera-authorization`, `test:vera-tools`, `test:vera-mentions`, and
  `test:vera-sessions` passed before the admin view and the dev stand-in flag
  were added, and they have not run since.
- Failed: `test:vera-obscura-smoke`. The browser submitted the login form, and
  the dev server answered `POST /login 200`, but the page never reached
  `/dashboard`. The cause is not yet known. One hypothesis is that the login
  page did not hydrate in Obscura, because it reached the dev server as
  `host.docker.internal`.
- Not run: the full `pnpm lint`, `pnpm build`, and a browser check by a person.
  The pdf.js trace in the standalone build is therefore unverified.

## Shared-worktree ownership

The tree is shared with concurrent product agents. At snapshot time, the
uncommitted paths observed outside this wiki were:

- `modules/mentor/KaptenQuestionBankBuilderPageModule.tsx`;
- `modules/mentor/KaptenTryoutBuilderPageModule.tsx`;
- `modules/mentor/KaptenTryoutCataloguePageModule.tsx`;
- `modules/mentor/KaptenTryoutSettingsPageModule.tsx`;
- `scripts/test-tryout-authoring-workspace.ts`;
- `public/mascott.webm` and the untracked `public/mascot.webm`.

This refresh edits only `docs/wiki/*` and `docs/vera-ai/*`. Do not stage or
reset the paths above; they belong to other work. Harness memory/tracking files
were not changed by this wiki update.

## Remaining work map

1. **Environment and database proof.** Run the guarded Prisma status command
   against the intended disposable/staging database, then apply or verify the
   current migration set as an explicitly owned operation. Do not infer this
   from migration filenames.
2. **Vera smoke.** Make `test:vera-obscura-smoke` pass. The first run logged in,
   but the browser stayed on `/login`. Confirm whether the login page hydrates
   when Obscura loads it from `host.docker.internal`, since Next's dev-origin
   checks may block its scripts there.
3. **Production build.** Run `pnpm build`, then check that the Vera API routes'
   trace files list the pdf.js `standard_fonts` and `cmaps` folders.
4. **Browser acceptance.** Ask for explicit permission before any ego-browser
   check, naming the routes (`/vera-ai` and `/admin/ai/usage`), the roles
   (Voyager and Admin), and the checklist. No browser result is implied by this
   page.
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

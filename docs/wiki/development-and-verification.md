# Development and verification

## Toolchain

- Node package manager: `pnpm@10.33.0` (the repository's `package.json` is
  authoritative).
- Runtime: Next.js `16.2.9`, React `19.2.4`, strict TypeScript, Tailwind CSS
  v4, shadcn primitives, Phosphor icons, Prisma `7.x`, PostgreSQL, Redis, and
  optional object storage/media adapters.
- Development server: port `5023` through `pnpm dev`.
- Production shape: Next standalone output, started with
  `.next/standalone/server.js`.

## Guarded command rule

The shared host has a project resource policy. Before any Node, pnpm, Prisma,
test, build, worker, or script launch:

```bash
./_harness/resource-guard.sh status
./_harness/resource-guard.sh run -- <command>
```

For example:

```bash
./_harness/resource-guard.sh run -- pnpm lint
./_harness/resource-guard.sh run -- pnpm test:suite-manifest
./_harness/resource-guard.sh run -- pnpm verify
```

Do not start parallel/watch workers or bypass the guard. Stop agent-owned
servers before handing work to another agent.

## Local setup

1. Copy `.env.example` to `.env` and supply local PostgreSQL credentials.
   [`.env.example`](../../.env.example) is the canonical checked-in inventory
   for core and disposable-test settings; deployment-only secrets are supplied
   by the environment and are intentionally not copied into this wiki.
   `README.md` documents the core setup and seed workflow.
2. Install with the repository lockfile through the guard:
   `./_harness/resource-guard.sh run -- pnpm install --frozen-lockfile`.
3. Generate the client and run the development server with the guarded
   `pnpm dev` workflow.
4. Use `pnpm db:seed` only when a disposable/local database reset is intended;
   it resets the database, reapplies migrations, and seeds the demonstration
   journey. `pnpm db:seed-assessment` and `pnpm db:seed-ai-usage` are narrower
   fixture workflows.

Never copy credentials or `.env` values into this wiki, commit, issue, or
agent message. Demo accounts in `README.md` are fixtures, not production
access.

## Verification commands

| Goal | Guarded command | Scope |
| --- | --- | --- |
| Lint | `pnpm lint` | ESLint repository check |
| TypeScript | `pnpm exec tsc --noEmit --pretty false` | Strict type check |
| Full verification | `pnpm verify` | Lint followed by standalone production build |
| Prisma status | `pnpm exec prisma migrate status` | Configured database only; read the output before mutation |
| Admin-import worker | `pnpm admin:imports-worker:check`; run `pnpm admin:imports-worker` only with approved PostgreSQL/Redis/handoff configuration | Readiness, heartbeat, BullMQ dispatch, stale-claim repair, row-claim reaping, and retention cleanup |
| Admin-import worker contracts | `pnpm test:admin-import-worker-readiness`, `pnpm test:admin-import-worker-flap`, `pnpm test:admin-import-dispatch` | Startup/config failures, Redis/worker flaps, bounded dispatch retries, and stale/missing queue-job recovery |
| Kuis versioning | `pnpm test:kuis-versioning`, `pnpm test:standalone-quiz-version-storage`, `pnpm test:standalone-quiz-version-runtime`, `pnpm test:assessment-answer-contract` | Digest/lifecycle projections plus persisted version storage, default runtime cutover, and scalar/multiple-answer compatibility |
| Kuis UI/assembly | `pnpm test:kuis-ui-first-workspace`, `pnpm test:kuis-assembly-binding` | Current Kuis workspace and durable assembly contracts |
| Assessment release/runtime | `pnpm test:random-assembly-release`, `pnpm test:assessment-release-invariants`, `pnpm test:assessment-scoring-release-invariants`, `pnpm test:assessment-participant-view` | Ready assembly-to-release pinning, scoring/release gates, and participant projections |
| Question bank/CBT/commerce | `pnpm test:question-bank-multiple-answer`, `pnpm test:question-bank-purpose`, `pnpm test:question-bank-materi`, `pnpm test:cbt-only-cutover-migration`, `pnpm test:cbt-only-schema-retirement`, `pnpm test:affiliator` | Multiple-choice answer contract, purpose/Materi scope, CAT retirement, and referral/purchase attribution contracts |
| Operational primitives | `pnpm test:media-domain`, `pnpm test:mentor-bank-package-ui`, `pnpm test:mentor-bank-soal-catalogue-context-menu`, `pnpm test:tryout-authoring-workspace` | Select, field-wrapper, table, badge, mode-card, and tab composition contracts |
| Test manifest | `pnpm test:suite-manifest` | Every `scripts/test-*` file is exposed by a package test command |
| Mentor IA | `pnpm test:mentor-dashboard-ia` | Mentor dashboard/reference surface contracts |
| Vera AI control plane | `pnpm test:admin-ai-control-plane` | Admin AI metric/privacy/governance contracts |
| Vera learner MVP | `pnpm test:vera-mvp-contracts` | Feature gates, context/history budgets, typed studio output, and disabled apply registry |
| Vera automatic context foundation | `pnpm test:vera-auto-context-foundation` | Strict tool/result contracts, released-source authority, deterministic registry projections, identity-bearing pack manifests, encryption, and purge markers |
| Vera automatic context orchestrator | `pnpm test:vera-auto-context-orchestrator` | Two-stage dispatch state machine, single tool execution, frozen evidence, replay/crash boundaries, final-turn tool disablement, and citation validation |
| Vera automatic context UI | `pnpm test:vera-auto-context-ui` | Enabled/legacy cohort rendering, absence of manual context APIs in automatic mode, committed source summaries, and reconnect/empty-evidence states |
| Vera automatic context operations | `pnpm test:vera-auto-context-operations` | Rollout policy, emergency off, aggregate-only telemetry, capability/canary gates, privacy checks, and release verification |
| Vera v2 billing | `pnpm test:vera-billing-v2` | Exact decimal/USD-micro accounting, reservation conservation, cutover windows, schema markers, and worker bounds |
| Vera paid provider | `pnpm test:vera-paid-provider` | Release manifest, Relace/OpenRouter route, privacy/max-price gates, SSE mapping, and generation reconciliation |
| Vera reconciliation worker | `pnpm vera:reconciliation-worker:check`; run `pnpm vera:reconciliation-worker` only in an approved worker environment | TypeScript worker contract and bounded lease/claim/evidence-settlement loop; `VERA_RECONCILIATION_ONCE=1` runs one cycle |
| Scalability simulation | `pnpm test:scalability` | Disposable Docker/two-API/Redis simulation only |

The test suite is contract-oriented rather than a single catch-all command.
Read the individual `scripts/test-*.ts` or `.mjs` file before selecting a
database-backed test. Some suites require disposable PostgreSQL variables and
some reset or mutate fixture data.

## Current environment and migration boundary

The Vera code reads additional deployment/runtime values that are not safe to
materialize in documentation: `VERA_IDEMPOTENCY_HMAC_SECRET`, optional
`VERA_CURSOR_HMAC_SECRET`, `VERA_ENVELOPE_MASTER_KEY`, live/mock provider flags,
`OPENROUTER_API_KEY`, `VERA_GENERATION_API_URL`, and a validated provider
release manifest/certifier. `VERA_DISPOSABLE_DB_ACK=1`,
`VERA_DISPOSABLE_REDIS_URL`, and `VERA_HTTP_ROUTE_TEST_MODE=1` are reserved for
guarded disposable tests. Keep values in `.env`, CI secrets, or the deployment
secret store; never add them to the wiki.

At the snapshot commit, `prisma/migrations/` contains 71 migration files,
including Kuis version storage/runtime scoping, CBT-only schema retirement,
question-bank purpose/materi changes, affiliator attribution, auto-publish,
and the Vera usage-window/cost/reservation ledger. This is migration history,
not proof that a configured local or production database has applied all 70;
use the guarded Prisma status command before any mutation.

The reconciliation worker's fixed safety envelope is batch 50, a 30-second
poll interval, 90-second leases renewed every 20 seconds, at most 10 in-flight
evidence calls, a 5-second call timeout, five-minute evidence backoff, and a
120-minute settlement deadline. Claims are fenced in the database; stale or
unrecoverable attempts settle conservatively as unknown. Use the one-cycle
mode only with disposable or explicitly approved worker credentials.

The admin-import worker requires valid `DATABASE_URL`, `REDIS_URL`,
`APP_BASE_URL`, and the enrollment-handoff key ring. It publishes a Redis
heartbeat every 15 seconds with a 45-second TTL, dispatches at most ten claims
per pass, retries BullMQ jobs five times with exponential backoff capped at
five minutes, and retains completed/failed jobs for seven/thirty days with a
1,000-job count cap. Its reconciliation pass repairs stale claims and missing
queue jobs; row-claim reaping and cleanup are separate guarded worker phases.
Use `pnpm admin:imports-worker:smoke` only with distinct local disposable
database and Redis URLs.

## Browser verification gate

Browser verification uses the in-app `ego-browser` workflow only after explicit
user permission. A request must name the exact route(s), role/session, and
checklist. Do not infer browser approval from a passing static or contract
test. The completed operational-primitive migration (P1 selects/tables, P2
onboarding/wrappers/tabs, and the badge/mode-card batch) has guarded
TypeScript, targeted ESLint, focused contract, static-sweep, and diff-check
evidence; browser QA was not run for it.

## Current verification caveats

- The broader admin-import contract currently stops on a pre-existing English
  copy assertion; this is recorded as a baseline and is not evidence that the
  operational-primitive migration failed.
- The shared worktree contains unrelated concurrent product edits. A full
  repository check must be interpreted against the current diff and the
  owning agent's scope, not against this documentation commit alone.
- Harness-only documentation changes can be validated with the harness
  validator, JSON parsing, Markdown inspection, and `git diff --check`; a
  product build is not required to validate Markdown.
- The 22 September 2026 guarded contract pass recorded four passing Kuis
  version contracts, the independent random/Blueprint release contract, the
  admin AI control-plane suite, Vera MVP, billing, paid-provider, and
  reconciliation-worker typecheck suites. The Kuis UI-first workspace and
  assembly-binding contracts remain source/contract drift failures: their
  current assertions do not match the editor's `pristineSubjectCode` guard or
  current Bank Soal copy. No source or test fix was made during that pass.
- That pass did not run full lint/build, Prisma status or migrations, live
  worker execution, or browser verification. Treat the command table as the
  route to repeatable evidence, not as a claim that those checks passed.

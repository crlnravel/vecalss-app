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

1. Copy `.env.example` to `.env` and supply local PostgreSQL credentials. The
   README lists the complete variable set, including optional Redis, preview,
   encryption, R2, Materi, and Vera disposable settings.
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
| Kuis versioning | `pnpm test:kuis-versioning` | Digest, lifecycle, projections, and schedule contracts |
| Kuis UI/assembly | `pnpm test:kuis-ui-first-workspace`, `pnpm test:kuis-assembly-binding` | Current Kuis workspace and durable assembly contracts |
| Test manifest | `pnpm test:suite-manifest` | Every `scripts/test-*` file is exposed by a package test command |
| Mentor IA | `pnpm test:mentor-dashboard-ia` | Mentor dashboard/reference surface contracts |
| Vera AI control plane | `pnpm test:admin-ai-control-plane` | Admin AI metric/privacy/governance contracts |
| Scalability simulation | `pnpm test:scalability` | Disposable Docker/two-API/Redis simulation only |

The test suite is contract-oriented rather than a single catch-all command.
Read the individual `scripts/test-*.ts` or `.mjs` file before selecting a
database-backed test. Some suites require disposable PostgreSQL variables and
some reset or mutate fixture data.

## Browser verification gate

Browser verification uses the in-app `ego-browser` workflow only after explicit
user permission. A request must name the exact route(s), role/session, and
checklist. Do not infer browser approval from a passing static or contract
test. The current P1 operational-primitive migration has guarded TypeScript,
targeted ESLint, mentor static tests, and diff-check evidence; browser QA was
not run for it.

## Current verification caveats

- The broader admin-import contract currently stops on a pre-existing English
  copy assertion; this is recorded as a baseline and is not evidence that the
  P1 select/table migration failed.
- The shared worktree contains unrelated concurrent product edits. A full
  repository check must be interpreted against the current diff and the
  owning agent's scope, not against this documentation commit alone.
- Harness-only documentation changes can be validated with the harness
  validator, JSON parsing, Markdown inspection, and `git diff --check`; a
  product build is not required to validate Markdown.

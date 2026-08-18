# Vecalss App

This repository contains the current `vecalss-app` MVP foundation plus the
first coherent account lifecycle slice for:

- `UC-00` User Authentication and Session Management
- `UC-02` Complete First-Login Onboarding
- `UC-18` Manage Student Enrollment

## Local Setup

1. Copy `.env.example` to `.env`.
2. Fill in the required values.
3. Install dependencies with `pnpm install`.
4. Start the app with `pnpm dev`.
5. Seed demo data with `pnpm db:seed`.

## Demonstration Data

Run the complete reset and seed before a product demonstration or usability session:

```bash
pnpm db:seed
pnpm db:verify-demo
```

`pnpm db:seed` resets the database, reapplies all migrations, and runs the
complete demo seed. It recreates all seven UTBK subjects, the Materi catalogue,
21 reviewed questions, seven quizzes, seven reusable question packages, a
published seven-test tryout, an open delivery session, released historical
results, and participant records in active, pending, rejected, and revoked
states. Existing database data is deleted by the reset.

Use these accounts for the principal test journeys:

| Journey | Account | Password | Start page |
| --- | --- | --- | --- |
| Administrator enrollment | `admin@vecalss.local` | `Admin12345!` | `/login` |
| Returning student with learning history | `student@vecalss.local` | `Student12345!` | `/login` |
| New student completing first login | `newstudent@vecalss.local` | `TempStudent123!` | `/login` |
| Tutor authoring and tryout operations | `tutor@vecalss.local` | `Tutor12345!` | `/login` |

The assessment-only command expects the accounts and Materi taxonomy to exist.
Use `pnpm db:seed-assessment` only when refreshing assessment data in an already
prepared demonstration database.

## Required Environment Variables

- `DATABASE_URL`: PostgreSQL connection string used by Prisma.
- `APP_BASE_URL`: Base URL used to generate password-reset links.
- `REGISTRATION_FORM_URL`: Public registration form target used by landing-page CTAs.
- `SEED_*`: Optional overrides for the dummy admin, student, and tutor credentials created by
  `pnpm db:seed`.

For local role testing, you can set `DEBUG=true` in `.env`. The avatar menu will
then show a development-only account switcher for active seeded accounts. It
is disabled by default and also requires `NODE_ENV=development`; the server
checks both conditions before listing accounts or changing the session.

## Verification

Use this sequence to verify the current auth/onboarding/enrollment slice:

```bash
pnpm lint
pnpm exec next build --webpack
pnpm exec prisma migrate status
pnpm db:seed
```

### Manual Materi cutover initialization

Use this sequence only against the intended deployment database:

```bash
pnpm exec prisma migrate status
pnpm exec prisma migrate deploy
MATERI_SEED_TUTOR_EMAIL=tutor@example.com pnpm db:seed-materi
MATERI_DEMO_PDF_URL=http://localhost:5023/api/materi-demo/test.pdf \
MATERI_ALLOW_LOCAL_PDF_URL=1 \
MATERI_SEED_TUTOR_EMAIL=tutor@example.com \
pnpm db:seed-materi -- --apply --confirm=RESET_CANONICAL_MATERI_DEMO_ONLY
pnpm db:verify-materi-cutover
pnpm dev
```

`db:seed-materi` is a read-only preflight by default. The second command is the
only form that can execute the deliberate reset, and it requires both
`--apply` and the unmistakable confirmation token. The operation locks the
module scope, checks quiz/tryout/operational dependencies, deletes only
canonical Materi modules/assets/progress/prerequisites, and reseeds exactly 21
clearly marked document-first demo units in one transaction. Any failure rolls
back the database. Users, shared subjects/topics, quiz/tryout data, non-Materi
modules, and shared Media Assets are not targeted.

The local PDF fixture is the supplied `tmp/test.pdf`. The guarded apply stores
an explicitly supplied absolute URL; for local development the route reads the
fixture without modifying it. Set `MATERI_DEMO_PDF_BASE_URL` for read-only
preflight or a complete `MATERI_DEMO_PDF_URL` for apply when the app uses
another origin. Run the
read-only verifier immediately after the cutover; it checks seven subjects,
21 sections, 21 stable demo modules, explicit PDF attachment metadata, and
both document-only and document-plus-video coverage.

## Current Routes

- `/login`
- `/forgot-password`
- `/reset-password/[token]`
- `/change-password`
- `/onboarding`
- `/dashboard`
- `/notifications`
- `/notifications/[notificationId]`
- `/admin/notifications`
- `/admin/enrollment`
- `/mentor/dashboard`

## Two-API-instance scalability simulation

The repository includes a disposable Docker harness with two production Next
servers sharing one Redis instance. It sends concurrent requests for the same
rate-limit token through both containers and verifies the shared 12-attempt
limit plus the 64-key shard bound.

```bash
pnpm test:scalability
```

The command builds the standalone image, starts `redis`, `api1`, and `api2`,
runs the load driver, then removes only its compose project and Redis data.
The runner generates an ephemeral simulation secret when one is not supplied;
the API ports are kept inside the Compose network, and direct Compose use
requires an explicit `SCALABILITY_SIMULATION_SECRET` of at least 32
characters. The simulation endpoint is disabled unless the compose-only
simulation flag and secret are present.

The same standalone contract is used by the regular production scripts:
`pnpm build` prepares the traced assets and `pnpm start` launches
`.next/standalone/server.js`.

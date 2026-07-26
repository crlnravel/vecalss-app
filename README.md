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

Run the complete seed before a product demonstration or usability session:

```bash
pnpm db:seed
pnpm db:verify-demo
```

The seed is safe to run repeatedly. It prepares all seven UTBK subjects, the
Materi catalogue, 21 reviewed questions, seven quizzes, seven reusable question
packages, a published seven-test tryout, an open delivery session, released
historical results, and participant records in active, pending, rejected, and
revoked states.

Use these accounts for the principal test journeys:

| Journey | Account | Password | Start page |
| --- | --- | --- | --- |
| Administrator enrollment | `admin@vecalss.local` | `Admin12345!` | `/admin/login` |
| Returning student with learning history | `student@vecalss.local` | `Student12345!` | `/login` |
| New student completing first login | `newstudent@vecalss.local` | `TempStudent123!` | `/login` |
| Tutor authoring and tryout operations | `tutor@vecalss.local` | `Tutor12345!` | `/mentor/login` |

The assessment-only command expects the accounts and Materi taxonomy to exist.
Use `pnpm db:seed-assessment` only when refreshing assessment data in an already
prepared demonstration database.

## Required Environment Variables

- `DATABASE_URL`: PostgreSQL connection string used by Prisma.
- `APP_BASE_URL`: Base URL used to generate password-reset links.
- `REGISTRATION_FORM_URL`: Public registration form target used by landing-page CTAs.
- `SEED_*`: Optional overrides for the dummy admin, student, and tutor credentials created by
  `pnpm db:seed`.

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
pnpm db:verify-materi-cutover
pnpm dev
```

`db:seed-materi` requires an existing active tutor with an active tutor role
and active tutor profile;
it never creates or updates users, roles, profiles, cohorts, exam data, or
other demo records. It writes only the canonical Materi taxonomy and missing
lesson/video rows in one transaction. Run the read-only exact parity verifier
immediately after seeding and before any CMS edits: it intentionally fails
after legitimate Kapten edits, reordering, lifecycle changes, or video
replacements and is not an ongoing runtime health check.

## Current Routes

- `/login`
- `/admin/login`
- `/forgot-password`
- `/reset-password/[token]`
- `/change-password`
- `/onboarding`
- `/dashboard`
- `/admin/enrollment`
- `/mentor/dashboard`

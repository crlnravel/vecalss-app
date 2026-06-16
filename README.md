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

## Required Environment Variables

- `DATABASE_URL`: PostgreSQL connection string used by Prisma.
- `APP_BASE_URL`: Base URL used to generate password-reset links.
- `REGISTRATION_FORM_URL`: Public registration form target used by landing-page CTAs.

## Verification

Use this baseline to verify the current auth/onboarding/enrollment slice:

```bash
pnpm lint
pnpm exec next build --webpack
pnpm exec prisma migrate status
```

## Current Routes

- `/login`
- `/forgot-password`
- `/reset-password/[token]`
- `/change-password`
- `/onboarding`
- `/dashboard`
- `/admin/enrollment`

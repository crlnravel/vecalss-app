# GUIDE_MENTOR_PAGE

## Goal

Build a kapten-facing dashboard that follows the LMS spec for **Kapten Dashboard (UC-15)** while staying visually native to the current Vecalss app.

Use **Kapten** in product/UI copy.
Use **Kapten** when mapping to existing schema/auth roles.

## What The Spec Requires

- Cohort-scoped dashboard
- Ranked student list
- Clear at-risk highlighting
- Filter by subtest
- Student detail with learning gaps
- Custom intervention message
- Recommended module link
- Cached-data fallback when analytics is unavailable
- Messaging disabled during analytics failure

## Current Repo Facts

- App routing pattern: `app/**/page.tsx` -> `modules/**/**PageModule.tsx`
- Student shell already exists:
  - `modules/student/components/student-workspace-shell.tsx`
  - `modules/student/components/student-sidebar.tsx`
- Current visual reference:
  - `modules/dashboard/DashboardPageModule.tsx`
  - `modules/student/NotificationsPageModule.tsx`
- Current auth only handles student/admin:
  - `lib/auth/access.ts`
  - `lib/auth/paths.ts`
- Kapten-capable schema already exists:
  - `TutorProfile`
  - `TutorCohortAssignment`
  - `RiskFlag`
  - `Intervention`

## Design Direction

- Reuse current green, navy, gold palette
- Reuse current card radius, shadows, header rhythm, and sidebar behavior
- Prefer dense, quiet, operational UI
- Keep wording short
- No marketing-style hero copy
- No new design language

## UI Direction

- Treat this as a **workspace**, not a landing page
- Desktop first, but mobile must collapse cleanly
- Primary screen should feel like:
  - cohort snapshot
  - risk triage
  - student inspection
  - intervention dispatch

## Recommended Route Shape

- `app/mentor/dashboard/page.tsx`
- `modules/mentor/MentorDashboardPageModule.tsx`
- `modules/mentor/components/*`

This keeps the kapten surface separate from student `/dashboard`.

## Reuse First

- `Button` variants: `brand`, `brandOutline`, `ghost`, `inverseOutline`
- `Card`, `StatTile`, `Progress`, `Tabs`
- Existing sidebar and notification patterns
- Existing `ScrollArea`, sticky top bar, and breadcrumb structure

## Suggested Information Architecture

- `Dashboard`
- `Students`
- `Interventions`
- `Notifications`
- `Settings`

Only `Dashboard` must be real in the first pass.
The rest can be placeholders if needed.

## Important Constraints

- UI-first phase: use mock data first
- Do not wire full Prisma queries until UI is approved
- Do not reuse student-specific labels like `Beranda siswa`
- Do not expose cross-cohort views
- Do not touch unrelated dirty files already in the repo

## Shared Mock Data Shape

Use mock data that already anticipates real schema:

- kapten profile
- active cohort
- cohort summary counts
- risk-filter tabs
- ranked students
- selected student detail
- recent interventions

## Acceptance Standard

- Looks like Vecalss already built it
- Clear kapten-specific job flow
- Easy to review step by step
- Minimal copy
- Ready for later auth/data wiring without redoing layout

# PLAN_1

## Goal

Create the kapten dashboard foundation only.

## Scope

- Add kapten route skeleton
- Add kapten page module
- Add kapten workspace shell
- Add kapten sidebar
- Add mock data file

## Files

- `app/mentor/dashboard/page.tsx`
- `modules/mentor/MentorDashboardPageModule.tsx`
- `modules/mentor/components/mentor-workspace-shell.tsx`
- `modules/mentor/components/mentor-sidebar.tsx`
- `modules/mentor/mock-data.ts`

## Build

- Mirror the student route-module pattern
- Reuse the current sticky header, breadcrumb, search, and sidebar behavior
- Keep the shell visually aligned with `StudentWorkspaceShell`
- Change labels and nav to kapten context
- Make the page render a clean empty frame for later sections

## Page Frame

- Top breadcrumb
- Search input
- Notification trigger
- Account menu
- Page title row
- Main two-column dashboard grid placeholder

## Guardrails

- Do not build real analytics
- Do not add Prisma queries
- Do not wire kapten auth yet
- Do not refactor unrelated student files unless truly required

## Review Checkpoint

- Route exists
- Kapten shell feels native
- Sidebar/navigation language is kapten-specific
- Layout is ready for dashboard sections

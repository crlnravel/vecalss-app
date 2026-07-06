# PLAN_5

## Goal

Prepare the approved UI for real kapten-role wiring.

## Scope

- Kapten auth guard
- Kapten home-path routing
- Cohort-scoped data contract
- Intervention persistence contract

## Depends On

- UI approved from `PLAN_1.md` to `PLAN_4.md`

## Files

- `lib/auth/access.ts`
- `lib/auth/paths.ts`
- `lib/auth/types.ts`
- kapten route/page files
- future kapten data loaders/actions

## Build

- Add kapten-aware route protection
- Add kapten default home path
- Map UI term `Kapten` to schema role `kapten`
- Fetch only assigned cohorts/students
- Shape data loaders around:
  - `TutorCohortAssignment`
  - `RiskFlag`
  - `Intervention`
  - student performance tables

## Data Rules

- Never expose students outside assigned cohort
- Keep list and detail payloads separate
- Intervention creation should support:
  - student id
  - cohort id
  - risk flag id
  - recommended module id
  - message

## Guardrails

- Do not redesign the UI during wiring
- Do not merge kapten and student dashboards
- Preserve current admin/student flows

## Review Checkpoint

- Kapten can reach the kapten dashboard
- Data scope is cohort-safe
- Real wiring fits the approved UI without layout churn

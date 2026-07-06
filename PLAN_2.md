# PLAN_2

## Goal

Build the kapten overview layer.

## Scope

- Cohort summary cards
- Filter row
- Ranked student list
- At-risk visual system

## Depends On

- `PLAN_1.md`

## Files

- `modules/mentor/MentorDashboardPageModule.tsx`
- Optional small components under `modules/mentor/components/`

## Build

- Add compact summary cards for:
  - total students
  - at-risk students
  - broken streaks
  - recent score drops
- Add a slim filter bar:
  - all
  - at risk
  - broken streak
  - low mastery
  - subtest filter
- Add ranked student roster

## Student Row Content

- student name
- cohort marker
- latest score/trend
- streak state
- weak subtest
- risk badge
- quick action / select state

## Visual Direction

- Reuse `Card` and `StatTile`
- Keep the list dense and scan-friendly
- Use gold for attention, not everywhere
- Make the active row obvious but calm

## Guardrails

- No deep student detail yet
- No intervention composer yet
- No real filter logic beyond mock-state UX if needed

## Review Checkpoint

- Kapten can scan the cohort in seconds
- At-risk students are obvious
- The list feels operational, not decorative

# PLAN_4

## Goal

Add the UX states that make the dashboard believable.

## Scope

- Empty states
- Cached-data fallback
- Disabled messaging state
- Loading skeletons
- Mobile/tablet behavior

## Depends On

- `PLAN_3.md`

## Files

- Mentor dashboard module/components
- Reuse existing UI primitives where possible

## Build

- Empty cohort state
- No at-risk students state
- No student selected state
- Analytics unavailable fallback:
  - cached cohort data still visible
  - intervention composer visibly disabled
- Loading skeletons for summary, list, and detail areas
- Responsive stacking for smaller screens

## UX Rules

- Fallback states should still feel useful
- Disabled actions must be clearly disabled
- Mobile should keep roster -> detail flow understandable
- Avoid horizontal scrolling for primary actions

## Guardrails

- No new design system primitives
- No extra pages unless absolutely necessary
- Keep states minimal

## Review Checkpoint

- The page still makes sense without perfect data
- Failure handling matches the spec
- Mobile flow is clean enough for real use

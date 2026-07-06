# PLAN_3

## Goal

Build the student drill-down and intervention flow.

## Scope

- Selected student detail panel
- Learning-gap cards
- Intervention composer
- Recommended module selection UI

## Depends On

- `PLAN_2.md`

## Files

- `modules/mentor/MentorDashboardPageModule.tsx`
- Optional extracted components:
  - `mentor-student-detail.tsx`
  - `mentor-intervention-composer.tsx`
  - `mentor-gap-card.tsx`

## Build

- When a student is selected, show:
  - identity block
  - score trend snapshot
  - weak subtests/topics
  - recent activity / last intervention
- Add a compact intervention composer:
  - short message textarea
  - recommended module picker/link slot
  - draft/send actions

## UX Rules

- Keep the detail panel always actionable
- Prioritize weak-topic clarity over long descriptions
- Message input should feel lightweight
- Recommended module should be one clear choice, not a huge form

## Copy Style

- Short labels
- Short helper text
- No motivational wall of text in the layout itself

## Guardrails

- No actual notification dispatch
- No server actions yet
- No large modal flow unless the inline panel fails badly

## Review Checkpoint

- Kapten can inspect one student quickly
- Kapten can draft an intervention without friction
- Detail panel feels like a continuation of the roster, not another app

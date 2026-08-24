---
name: Vecalss
description: "A playful voyage map for focused, human-guided PTN learning."
colors:
  voyage-deep: "#014C38"
  voyage-forest: "#176B4D"
  voyage-leaf: "#2F8A5D"
  sea-glass: "#B7DDC3"
  sea-glass-wash: "#EEF8F1"
  canvas: "#F7FAF8"
  surface: "#FFFFFF"
  ink: "#173C2D"
  muted-ink: "#5F776A"
  soft-border: "#D6E5DB"
  warm-sun: "#FFD766"
  warm-sun-ink: "#5B4B18"
  voyage-deep-hover: "#013D2E"
typography:
  display:
    fontFamily: "Manrope, Plus Jakarta Sans, sans-serif"
    fontSize: "clamp(2.25rem, 4vw, 3.5rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.045em"
  headline:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "clamp(1.5rem, 2.5vw, 2.25rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.75
  action:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.2
  label:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.14em"
rounded:
  sm: "12px"
  md: "20px"
  lg: "32px"
  xl: "36px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "40px"
components:
  button-primary:
    backgroundColor: "{colors.voyage-deep}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: "44px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: "44px"
  button-marketing:
    backgroundColor: "{colors.voyage-deep}"
    textColor: "{colors.surface}"
    typography: "{typography.action}"
    rounded: "{rounded.pill}"
    padding: "16px 28px"
    height: "56px"
  button-marketing-compact:
    backgroundColor: "{colors.voyage-deep}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
    height: "44px"
  button-onboarding:
    backgroundColor: "{colors.warm-sun}"
    textColor: "{colors.warm-sun-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.pill}"
    padding: "14px 24px"
    height: "52px"
  button-learning-primary:
    backgroundColor: "{colors.voyage-forest}"
    textColor: "{colors.surface}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "48px"
  button-learning-attention:
    backgroundColor: "{colors.warm-sun}"
    textColor: "{colors.warm-sun-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: "44px"
  card-course:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input-search:
    backgroundColor: "{colors.sea-glass-wash}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  chip-mint:
    backgroundColor: "{colors.sea-glass-wash}"
    textColor: "{colors.voyage-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
  navigation-sidebar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "0px"
    padding: "20px 12px"
    width: "240px"
  journey-node:
    backgroundColor: "{colors.voyage-forest}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "36px"
    size: "112px"
---

# Design System: Vecalss

## Overview

**Creative North Star: "The Playful Voyage Map"**

Vecalss makes learning feel like a journey with a visible route, friendly
landmarks, and a clear next step. The Materi experience is the strongest
expression of this idea: sea-glass gradients soften the surface, deep green
anchors actions and progress, and voyage illustrations turn completion into a
small story rather than a checklist.

The system is playful but purposeful. It uses generous rounded geometry,
confident type, tactile interaction feedback, and a light canvas so students
can scan quickly without losing warmth. Playfulness belongs in the moments that
explain progress, invite action, or reward completion; authoring and operational
surfaces should borrow the same language with a calmer density.

**Key Characteristics:**

- Deep voyage green paired with sea-glass mint gradients.
- Friendly, heavy headings with readable supporting copy.
- Soft-lifted cards with occasional offset shadows for tactile states.
- Rounded containers, expressive icons, and purposeful voyage illustrations.
- Small lifts, tilts, and presses that clarify interaction without becoming a game layer.

### Guide map

Read this root file first. Its frontmatter is the machine-readable source for
palette, typography, shape, spacing, and shared component tokens. Then open the
focused file that matches the work:

| Work area | Focused guideline |
| --- | --- |
| Colors, typography, layout, depth, shapes, and page-title rules | [Foundations](docs/design-guidelines/foundations.md) |
| Buttons, chips, tabs, status tokens, cards, and inputs | [Components](docs/design-guidelines/components.md) |
| Validation hierarchy and transient notifications | [Feedback](docs/design-guidelines/feedback.md) |
| Dropdowns, approved tables, responsive overflow, and TanStack boundaries | [Operations](docs/design-guidelines/operations.md) |
| Parent navigation and the learning-journey node | [Navigation](docs/design-guidelines/navigation.md) |
| Cross-cutting product rules and anti-patterns | [Principles](docs/design-guidelines/principles.md) |

Use the narrowest relevant file during implementation, and read the neighboring
file when a rule crosses a boundary. If a focused file and the root tokens seem
to conflict, the root tokens and the most specific interaction rule win.

### Global invariants

- Keep page titles direct and concise; name the current destination once, such
  as “Tryout Workspace.”
- Back controls return exactly one level to the immediate parent and never skip
  to a grandparent or broad catalogue.
- Use exactly two tab variants: compact content-sized filter pills and
  full-width equal-width line tabs.
- Use the shared custom `DropdownMenu` family instead of native dropdowns in
  ordinary product UI.
- Use the shared bottom-center Sonner surface for transient success and failure;
  keep ordinary fields and static data quiet unless they need attention.
- Prefer icon-only controls with shared tooltips for familiar compact utilities;
  keep visible text for primary, ambiguous, or consequential actions.
- Use the approved operational table references and avoid horizontal scrolling
  unless truncation would materially harm comprehension or actionability.
- Use the Bank Soal empty-state placeholder as the catalogue reference: a
  centered icon, concise heading, and short description; show action buttons
  only when the user has a direct, available next action.

### Reading order

1. Start here for the visual vocabulary and machine-readable tokens.
2. Open the focused guideline linked above before changing a corresponding
   component or flow.
3. Check [Principles](docs/design-guidelines/principles.md) before introducing a
   new pattern or exception.

## Colors

The palette in the frontmatter is normative. Apply its usage rules from
[Foundations](docs/design-guidelines/foundations.md); do not introduce
route-specific colors.

## Typography

The frontmatter carries the shared type scale. Use the hierarchy, readable
measures, and concise page-title rule in
[Foundations](docs/design-guidelines/foundations.md).

## Layout

Use the shared canvas, spacing rhythm, and responsive composition documented in
[Foundations](docs/design-guidelines/foundations.md).

## Elevation & Depth

Use the named shadow vocabulary and tactile-depth boundaries in
[Foundations](docs/design-guidelines/foundations.md).

## Shapes

Use the shared radii, border, focus, and no-message-badge rules in
[Foundations](docs/design-guidelines/foundations.md).

## Components

Detailed component contracts live in
[Components](docs/design-guidelines/components.md). Feedback and data-heavy
interactions are separated into [Feedback](docs/design-guidelines/feedback.md)
and [Operations](docs/design-guidelines/operations.md) so agents can load only
the relevant rules.

## Do's and Don'ts

The complete cross-cutting checklist is in
[Principles](docs/design-guidelines/principles.md). Use it before introducing a
new pattern, exception, or route-specific visual treatment.

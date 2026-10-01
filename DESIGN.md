---
name: Vecalss
description: "A playful voyage map for focused, human-guided PTN learning."
colors:
  voyage-deep: "#014C38"
  voyage-forest: "#176B4D"
  voyage-leaf: "#2F8A5D"
  sea-glass: "#B7DDC3"
  sea-glass-wash: "#EEF8F1"
  harbor-canvas: "#EEF2F0"
  ice: "#FCFDFC"
  mist-island: "#EEF3F1"
  mint-island: "#EEF5F2"
  canvas: "#F7FAF8"
  surface: "#FFFFFF"
  ink: "#173C2D"
  muted-ink: "#5F776A"
  soft-border: "#D6E5DB"
  warm-sun: "#FFD766"
  warm-sun-ink: "#5B4B18"
  warm-sand: "#F2C89F"
  harbor-orange: "#FFB77C"
  rating-gold: "#E8AD16"
  voyage-deep-hover: "#013D2E"
typography:
  display:
    fontFamily: "Manrope, Plus Jakarta Sans, sans-serif"
    fontSize: "clamp(2.25rem, 4vw, 3rem)"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.04em"
  marketing-display:
    fontFamily: "Manrope, Plus Jakarta Sans, sans-serif"
    fontSize: "clamp(3.25rem, 7vw, 6rem)"
    fontWeight: 600
    lineHeight: 0.9
    letterSpacing: "-0.04em"
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
  brand-wordmark:
    fontFamily: "Sports World, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.08em"
rounded:
  indicator: "4px"
  detail: "8px"
  sm: "12px"
  compact: "20px"
  md: "20px"
  lg: "32px"
  xl: "36px"
  pill: "9999px"
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
  button-warning:
    backgroundColor: "{colors.warm-sun}"
    textColor: "{colors.warm-sun-ink}"
    typography: "{typography.action}"
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
  marketing-scene:
    backgroundColor: "transparent"
    textColor: "{colors.voyage-deep}"
    typography: "{typography.body}"
    rounded: "0px"
  navigation-marketing:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.voyage-deep}"
    typography: "{typography.body}"
    rounded: "{rounded.compact}"
    padding: "8px 8px 8px 16px"
    height: "56px"
  program-grid-item:
    backgroundColor: "transparent"
    textColor: "{colors.voyage-deep}"
    typography: "{typography.body}"
    rounded: "0px"
    padding: "24px"
  learning-step:
    backgroundColor: "transparent"
    textColor: "{colors.voyage-deep}"
    typography: "{typography.body}"
    rounded: "0px"
    padding: "16px"
  testimonial-story:
    backgroundColor: "transparent"
    textColor: "{colors.voyage-deep}"
    typography: "{typography.body}"
    rounded: "0px"
    padding: "28px 28px 32px"
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

Public storytelling extends that world across one uninterrupted pale Harbor
Canvas. A connected hero network, real Kapten and alumni, campus marks, voyage
objects, and the mascot sit directly on that field so every learning activity
and person reads as part of one route toward campus. Story beats are shaped by
whitespace, scale, and motion rather than filled panels or card containers;
operational screens inherit the materials and contrast without copying this
stagecraft.

**Key Characteristics:**

- Deep voyage green paired with sea-glass mint gradients.
- Friendly, heavy headings with readable supporting copy.
- Soft-lifted cards and tactile depth only where the product needs a functional container or control.
- Rounded containers, expressive icons, and purposeful voyage illustrations.
- Small lifts, tilts, and presses that clarify interaction without becoming a game layer.
- One continuous pale Harbor Canvas with full-width story beats separated by whitespace.
- Connected networks, human orbits, free-floating step fans, and moving proof that explain relationships spatially.

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
- Use one specialty sunken tab treatment, with content-sized filters or
  equal-width peer navigation. Generic filled and underline tab styles are retired.
- Use the shared custom `DropdownMenu` family instead of native dropdowns in
  ordinary product UI.
- Use the shared top-center Sonner surface for notification alerts and dynamic
  page status, including unsaved changes, saving, and edit-lock notices. Inline
  status text and page-local notification banners are retired. Keep field
  validation, blocking recovery content, and confirmation dialogs in place.
- Use one tactile Button family and one app-wide Badge based on the former
  StudentBadge treatment. Badges are always sunken; flat depth and the active
  tone are retired. Do not create audience-specific alternatives.
- All field controls use the sunken `/settings` treatment. Field labels use
  Manrope; values use Plus Jakarta Sans. Show field validation through the
  shared accessible tooltip treatment, retaining its programmatic error text.
- Use the semantic radius tokens from Foundations rather than arbitrary
  route-local corners or a rem-scaled radius formula.
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
[Foundations](docs/design-guidelines/foundations.md). The public landing uses
Harbor Canvas as one uninterrupted background; Ice, Mist Island, Mint Island,
and Surface remain available elsewhere in the product but do not become
section fills or backing rectangles on this page. Warm Sun, Warm Sand, and
Harbor Orange can live inside illustration assets without becoming fields
behind them. Rating Gold is reserved for rating symbols.

**The Continuous-Harbor Rule.** Keep the public landing on one pale Harbor
Canvas. Separate story beats with space and composition, never with filled,
bordered, rounded, or shadowed section frames.

**The Warm-Material Rule.** Warm fills support art, milestones, and proof. They
do not become backing cards behind landing-page art or replace the green action
hierarchy without a verified contrast pairing.

## Typography

The frontmatter carries the shared type scale. Use the hierarchy, readable
measures, and concise page-title rule in
[Foundations](docs/design-guidelines/foundations.md). Route-level page titles
use the Display role: Manrope at 800 weight, `2.25rem` on compact screens and
`3rem` from the medium breakpoint onward, with `1.25` line height,
`-0.04em` tracking, Voyage Ink, and balanced wrapping. Marketing statements
may use the lighter Marketing Display role: Manrope at 600 weight, tightly
tracked, with a compact 0.9 line height and a balanced measure around 10–20
characters. Body copy remains Plus Jakarta Sans at 14–16px, 1.5–1.75 line
height, and no wider than roughly 62 characters. Sports World is a brand asset,
reserved for the Vecalss wordmark rather than headings or interface labels.

**The Statement-and-Support Rule.** Let one large, short statement carry each
marketing story beat; supporting copy stays modest, high-contrast, and comfortably
measured beneath it.

## Layout

Use the shared canvas, spacing rhythm, and responsive composition documented in
[Foundations](docs/design-guidelines/foundations.md). Public marketing adds the
following reusable composition:

- **Continuous scene rhythm:** place each major story beat in a full-width,
  near-viewport-height region on one uninterrupted Harbor Canvas. Do not add
  outer gutters, rounded section frames, borders, fills, shadows, or visible
  seams; whitespace and composition establish the transitions.
- **Floating header:** center a fixed, 56px-high white shell near the top edge,
  no wider than 800px. Show the full navigation and paired entry actions at
  1024px and above; below that, retain the brand and expose the same routes in
  a 44px-minimum-target disclosure menu.
- **Connected hero:** keep one mascot core on the visual axis and connect it to
  direct human, campus, and voyage objects with quiet dashed routes. Satellites
  have no filled backing tiles; photo crops remain intrinsic images, and the
  mascot core uses only a quiet outline. Decorative connections are hidden
  from assistive technology; the promise and CTA remain legible without them.
- **Human and campus orbits:** the Kapten scene uses a rolling wheel of real
  university marks around its centered statement; marks counter-rotate so they
  stay legible while the wheel follows document scroll. The alumni scene keeps
  six portraits around its centered statement on wide screens and a three-image
  strip on narrow screens.
- **Program divider grid:** use three equal columns for the first three program
  offerings and let the fourth span the row. Shared hairline dividers create
  structure; individual items have no closed border, fill, radius, or shadow.
  Collapse to one column in source order on narrow screens, and recolor artwork
  to Voyage Deep so it belongs to the canvas.
- **Learning-step fan:** use five overlapping free-floating art-and-text groups
  with the center step upright and visually forward and its neighbors
  progressively rotated. Preserve the five-step choreography on mobile while
  reducing the emphasis of the two outer groups; no step receives a card
  surface.
- **Testimonial stage:** center one live quote group directly on the canvas.
  Desktop may preview the previous and next groups at low opacity and opposite
  rotations; mobile shows only the active group. Keep the real bordered
  previous/next controls together below the stage.
- **Anchor movement:** landing-page in-page links scroll smoothly at the
  document root. Under `prefers-reduced-motion: reduce`, switch to immediate
  scrolling and preserve the same destination offsets.

**The One-Connected-Voyage Rule.** Relationship layouts must communicate a
system—people, learning activities, and outcomes connected to one journey—not
a decorative collage of disconnected elements.

### Shipped reference and QA evidence

The home surface is the reference implementation for this marketing grammar;
its finish verdict is **SHIP**. Use
`.impeccable/quality-bar/home.md` as the acceptance contract. Visual evidence
lives at `.impeccable/review/desktop-continuous.png` (1440px full page) and
`.impeccable/review/mobile-continuous.png` (390px full page). Focused evidence
lives at `output/playwright/hero-direct-final.png`,
`output/playwright/program-direct-background.png`,
`output/playwright/learning-direct-background.png`, and
`output/playwright/testimonials-direct-background.png`.

## Elevation & Depth

Use the named shadow vocabulary and tactile-depth boundaries in
[Foundations](docs/design-guidelines/foundations.md). The landing itself is flat:
story regions, hero satellites, program offerings, learning steps, portraits,
campus marks, and testimonials receive no resting surface shadow. Depth comes
from overlap, scale, opacity, and motion. Filled or lifted treatments remain
valid for functional navigation, menus, primary actions, and bounded controls.

Motion reinforces relationships rather than simulated cards: the full hero is
visible on first paint, its satellites drift by only a few pixels, and the
composition scales, softens, and fades as the Kapten scene's university-logo
wheel turns into view. The logo track rotates with section scroll while each
mark counter-rotates to remain readable. Program offerings lift in sequence,
the learning stack opens into a five-step fan, testimonials shuffle through previous, active, and next
positions, and each outgoing scene continues a short distance in the direction
of travel. The oversized footer word rises beneath the footer's clipped viewport
instead of being resized to fit. Ambient motion runs only while its scene is
visible, and hidden-page motion pauses. The global
`prefers-reduced-motion: reduce` contract shows the final static composition,
disables looping movement, switches anchor scrolling to `auto`, and preserves
hierarchy, focus, and control state.

**The Motion-Is-Evidence Rule.** Animate connection, hierarchy, or state; if
the composition stops making sense when animation stops, the composition is
not finished.

## Shapes

Use the shared radii, border, focus, and no-message-badge rules in
[Foundations](docs/design-guidelines/foundations.md). The public landing does not
use radius to divide its story beats: the continuous canvas runs edge to edge.
Photo assets keep their intrinsic crop or silhouette without an added frame,
and illustrations have no art well. Rounded geometry remains reserved for real
interactive structures such as the floating navigation, menus, conversion
actions, and circular carousel controls.

## Components

Detailed component contracts live in
[Components](docs/design-guidelines/components.md). Feedback and data-heavy
interactions are separated into [Feedback](docs/design-guidelines/feedback.md)
and [Operations](docs/design-guidelines/operations.md) so agents can load only
the relevant rules.

- **Landing scene:** a full-width story region on the same Harbor Canvas as its
  neighbors. It has no independent fill, outer gutter, border, radius, shadow,
  or frame; whitespace and composition define its start and end.
- **Floating marketing navigation:** white, softly lifted, and compact. The
  logo lockup stays left, route pills occupy the center, and sign-in/primary
  entry actions stay right. Mobile replaces that row with a semantic
  `details`/`summary` menu without reducing targets below 44px.
- **Hero network:** satellites and intrinsic photo crops sit directly on the
  canvas. The mascot core is transparent with a quiet outline; no network node
  receives a filled tile or ambient card shadow.
- **Program divider grid:** use shared hairline rules around and between the
  offerings, not individual cards. Keep each item transparent and square;
  artwork is Voyage Deep and text hierarchy remains consistent.
- **Learning-step fan:** five free-floating art-and-text groups share a
  symmetric stack-to-fan sequence around the emphasized middle step. They use
  no fill, radius, border, or shadow.
- **Testimonial stage:** render only the active testimonial in the
  accessibility tree. Active and side quote groups remain transparent and
  shadowless; side previews are visual context, use `aria-hidden`, and never
  duplicate live announcements. Navigation buttons are real bordered controls
  with explicit Indonesian accessible names, visible focus, and 44px circular
  targets.
- **Icon language:** use the shared Phosphor wrapper exports for interface
  arrows, menu, stars, and utilities. Keep voyage objects, mascot, people, and
  campus marks as image assets rather than substituting generic line icons.

All marketing links, buttons, and summaries receive a visible 3px green-tinted
focus outline with a 3px offset. Small supporting text must meet at least 4.5:1
contrast; use Voyage Deep at the established 78% treatment on Harbor Canvas,
not low-opacity gray. The page must remain fully understandable before images
finish loading and when animation is disabled.

## Do's and Don'ts

The complete cross-cutting checklist is in
[Principles](docs/design-guidelines/principles.md). Use it before introducing a
new pattern, exception, or route-specific visual treatment.

### Do:

- **Do** run public story beats directly across one uninterrupted Harbor Canvas.
- **Do** make the learning system spatially connected through routes, orbits, dividers, and free-floating groups.
- **Do** use real Kapten, alumni, campus, mascot, and voyage assets where proof or identity is the message.
- **Do** preserve one readable active item, visible focus, 44px targets, and 4.5:1 small-copy contrast.
- **Do** verify public-surface changes at both 1440px and 390px and refresh the evidence paths above.

### Don't:

- **Don't** add filled cards, art wells, rounded section frames, border boxes, or shadows behind landing-page content groups.
- **Don't** carry orbit, fan, or full-viewport scene staging into operational screens by default.
- **Don't** depend on movement, side previews, or decorative imagery to communicate essential content.
- **Don't** expose inactive testimonial groups to assistive technology or duplicate live announcements.
- **Don't** shrink desktop compositions uniformly on mobile; replace them with an intentional reading order.

# Foundations

Use this file for the visual vocabulary shared by every Vecalss surface.

[Back to the design-system index](../../DESIGN.md)

## Colors

The palette is a voyage-green family: deep emerald creates orientation and
action, while sea-glass mint creates air, progress, and approachable surfaces.
Warm sun yellow is a rare attention color for skip, milestone, or celebratory
actions—not a second primary brand.

### Primary

- **Voyage Deep** (#014C38): the primary navigation, action, progress, and high-contrast
  anchor color.
- **Voyage Forest** (#176B4D): the friendlier mid-green used for learning nodes,
  completion states, and active illustrations.
- **Voyage Leaf** (#2F8A5D): the lighter interactive green used for hover, completed
  progress, and focus-adjacent emphasis.

### Secondary

- **Sea-Glass** (#B7DDC3): a soft mint tint for icon blocks, milestone surfaces, and
  gentle gradients.
- **Sea-Glass Wash** (#EEF8F1): the palest mint surface for selected states, input fills,
  and low-noise supporting panels.

### Tertiary

- **Warm Sun** (#FFD766): a small, high-salience accent for “Lewati ke sini”, milestone,
  or celebratory affordances. Keep it sparse so it retains meaning.

### Neutral

- **Canvas** (#F7FAF8): the pale green-white workspace background behind cards and
  routes.
- **Surface** (#FFFFFF): white cards and reading surfaces.
- **Ink** (#173C2D): deep green-black for headings and high-priority text.
- **Muted Ink** (#5F776A): soft green-gray for supporting copy and metadata.
- **Soft Border** (#D6E5DB): low-contrast green-gray for card boundaries and dividers.

### Named Rules

**The Sea-Glass Contrast Rule.** Use pale mint gradients to support hierarchy,
never as a substitute for text contrast. Primary actions, headings, and progress
states must remain anchored in deep green.

**The One Warm Accent Rule.** Warm sun is an event color. Do not let it become a
second competing brand palette across ordinary cards or navigation.

## Typography

**Display Font:** Manrope (with Plus Jakarta Sans fallback)

**Body Font:** Plus Jakarta Sans (with Avenir Next and Segoe UI fallbacks)

**Label/Logo Font:** Plus Jakarta Sans for UI labels; the local Sports World
face is reserved for the Vecalss logo lockup.

**Character:** The pairing is confident, rounded, and highly legible. Heavy
weights make learning milestones feel inviting and decisive, while the body
face stays calm enough for instructions, metadata, and long-form reading.

### Hierarchy

- **Display** (800, `2.25rem–3rem`, `1.25`, `-0.04em`): route-level page titles
  and high-confidence moments. Use Manrope with balanced wrapping and Voyage Ink.
- **Headline** (800, `2.25rem` max, `1.05`): catalogue
  headings and prominent learning content titles.
- **Title** (800, `1.25rem`, `1.2`): course cards, lesson nodes, and component
  headings.
- **Body** (500–600, `0.875rem–1rem`, `1.5–1.75`): explanations, metadata, and
  instructions; keep reading measures comfortable.
- **Label** (700, `0.75rem`, `0.14em` tracking, uppercase): subtest codes,
  section markers, and compact status context.

### Named Rules

**The Bold-Then-Readable Rule.** Let headings carry the personality through
weight and scale; never make supporting copy compete through decoration or
compressed line length.

**The Plain Page-Title Rule.** Use one short noun phrase as the page-level
title, naming the current workspace or destination directly (for example,
“Tryout Workspace”). Do not stack an eyebrow or overline above it and a
subtitle or description below it by default. If guidance is necessary, place
it in the task content instead of turning the title block into a multi-line
introduction.

Student and Mentor route headers use the Display treatment consistently: the
title is `2.25rem` on compact screens and `3rem` from the medium breakpoint
onward, with 800 weight, `1.25` line height, `-0.04em` tracking, Voyage Ink,
and balanced wrapping. Keep this treatment for the page-level destination;
editable entity names, toolbar labels, and section headings use their own
smaller hierarchy.

## Layout

Workspace surfaces use a light canvas, a collapsible left navigation, and a
sticky 64px top bar for breadcrumbs, search, notifications, and account actions.
The shared application shell reaches roughly 1420px, while the student Materi
catalogue uses a focused content measure around 78rem. Main content stays
centered with generous horizontal padding and a rhythm built from 4px, 8px,
16px, 24px, and 32px steps.

Catalogue surfaces favor wide, scan-friendly cards. On desktop, a Materi row
can become a three-column composition (icon, content, action); on small screens
it collapses into a vertical reading order without shrinking touch targets.
The learning path is a signature progress composition: alternating lesson
cards sit around a dashed central road, with circular or rounded milestones
carrying the next action. This road is for journeys and progress—not a default
layout for every admin or authoring screen.

Use 40px or more of separation between major sections. Prefer one clear
primary column over dense multi-panel dashboards, especially for student-facing
tasks.

## Elevation & Depth

The system is soft-lifted. Most surfaces are white or pale mint with a quiet
border and a diffuse shadow; hover states lift by a few pixels. Stronger
offset/bottom-edge shadows are reserved for playful learning nodes, progress
controls, and pressable actions where the physical cue helps the user
understand state. All action buttons use the shared tactile treatment. Keep
secondary actions quieter through color and border contrast rather than
removing their pressable edge. Tabs, navigation links, fields, and passive
metadata retain their own semantic treatments.

### Shadow Vocabulary

- **Ambient Card** (`box-shadow: 0 18px 42px -34px rgba(23,107,77,0.48)`): white cards at
  rest and on hover.
- **Lifted Card** (`box-shadow: 0 24px 52px -30px rgba(23,107,77,0.55)`): an interactive
  card that needs a little more emphasis.
- **Tactile Node** (`box-shadow: 0 9px 0 #0F563B, 0 26px 48px -30px rgba(23,107,77,0.68)`): an
  active learning milestone or pressable journey control.
- **Parchment Panel** (`box-shadow: 0 26px 80px -46px rgba(1,76,56,0.24)`): a larger panel with a subtle
  inner highlight.

### Named Rules

**The Soft-Lift Rule.** Resting surfaces should feel light; motion and shadow
should explain affordance, state, or progress rather than decorate every edge.

**The Shared Action Depth Rule.** Every Button uses the same restrained offset
edge, hover lift, and press response across all audiences. Select primary,
outline, destructive, warning, or inverse by meaning; do not add a flat family
or reproduce its shadows in route-local classes. Reduced motion removes
translation and keeps the border, color, focus, and disabled cues.

**The Sunken Filter Rule.** The active trigger in a compact filter-tab row uses
an inset, recessed depth to communicate selection. Equal-width peer tabs use
the same full selected border and sunken fill. Layout changes width allocation,
not the visual treatment; underline and generic filled tabs are retired.

## Shapes

Shapes use one semantic radius scale, defined once as CSS custom properties
in `app/globals.css`. Values are CSS pixels so the app's 15px root font size
does not change the geometry. All states of a component retain its radius.

| Token / utility | Value | Use |
| --- | --- | --- |
| `--radius-indicator` / `rounded-indicator` | 4px | Small checkbox marks and internal selection indicators. |
| `--radius-detail` / `rounded-detail` | 8px | Small menu items, tooltip interiors, and nested details. |
| `--radius-control` / `rounded-control` | 12px | Every Button, tab trigger, and navigation action. |
| `--radius-field` / `rounded-field` | 20px | Inputs, selects, choice/file fields, icon blocks, menus, popovers, and toasts. |
| `--radius-card` / `rounded-card` | 32px | Cards, table frames, and bounded content surfaces. |
| `--radius-panel` / `rounded-panel` | 36px | Dialogs, sheets, sidebar shells, and large route panels. |
| `--radius-pill` / `rounded-pill` | 9999px | Compact Badge metadata, avatar circles, and switch tracks. |

Use these utilities in shared primitives. Numeric rounded utilities remain
compatibility aliases to this scale, not additional design choices. Do not use
arbitrary `rounded-[...]` values or vary Button corners by audience. Structural
dividers, continuous marketing sections, and native media crops may remain
square; circles and capsule metadata use the pill token.

**The No-Message-Badge Rule.** Do not render complete sentences or user-facing
empty, error, unavailable, or not-found states as standalone capsule badges.
Avoid leading-dot pills such as “LOKASI TIDAK DITEMUKAN.” Place the message in
the relevant content flow or a calm empty/error-state block with an icon,
explanation, and next action when useful. Reserve badges and chips for compact
semantic metadata such as categories, filters, progress, or short status labels.

Borders are thin, low-contrast, and green-tinted. Focus rings are visible and
slightly stronger than resting borders. Avoid sharp corners on primary learning
surfaces unless a document preview or native media frame requires them.

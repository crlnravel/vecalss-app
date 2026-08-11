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
    typography: "{typography.title}"
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

- **Display** (800, `3.5rem` max, `0.98`): page-level
  statements, route titles, and high-confidence moments.
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
understand state.

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

## Shapes

Shapes are generous and friendly. Use 12px corners for ordinary controls,
20px for icon blocks and compact fields, 32px for cards, and 36px or more for
hero-scale or route surfaces. Pills are fully rounded and reserved for compact
status, tags, and actions that benefit from a capsule silhouette.

**The No-Message-Badge Rule.** Do not render complete sentences or user-facing
empty, error, unavailable, or not-found states as standalone capsule badges.
Avoid leading-dot pills such as “LOKASI TIDAK DITEMUKAN.” Place the message in
the relevant content flow or a calm empty/error-state block with an icon,
explanation, and next action when useful. Reserve badges and chips for compact
semantic metadata such as categories, filters, progress, or short status labels.

Borders are thin, low-contrast, and green-tinted. Focus rings are visible and
slightly stronger than resting borders. Avoid sharp corners on primary learning
surfaces unless a document preview or native media frame requires them.

## Components

### Buttons

- **Shape:** Friendly rounded corners (12px), with pill variants for prominent
  marketing or completion actions.
- **Primary:** Voyage Deep fill, white text, 44px minimum height, and generous
  horizontal padding. Use Voyage Forest or the deeper hover state for feedback.
- **Hover / Focus:** A small lift or tonal shift; keep the focus ring explicit
  and green-tinted. Pressable learning actions may use a short downward press.
- **Secondary / Ghost:** White or transparent surfaces with a soft green border
  or mint hover wash. They should never compete with the primary action.

### Chips

- **Style:** Compact, fully rounded labels with sea-glass wash and deep green
  text; status variants may use a pale warm-sun wash for drafts.
- **State:** Keep selected/active chips visibly stronger through background,
  border, or weight—not color alone.
- **Boundary:** Never use a chip or badge for a sentence or an empty, error,
  unavailable, or not-found message; use inline copy or a contextual state
  block instead.

### Student status tokens

Student badges and status chips use the semantic `student-status-*` token
family rather than route-specific hex values:

- **Category:** sea-glass wash with voyage-deep text for subject and content
  labels.
- **Neutral:** white surface with muted green text for passive metadata.
- **Active:** voyage-deep fill with white text for the current or in-progress
  state.
- **Attention:** warm-sun wash for upcoming, unread, flagged, or review-needed
  states.
- **Success:** pale green for completed or correct states.
- **Info:** a quiet blue wash for informational or practice states.
- **Danger:** a restrained red wash for incorrect or failed states.
- Solid variants are reserved for high-emphasis actions or result markers; use
  the wash variants for ordinary status labels.

Use the shared `StudentBadge` component for compact pills. The warm-sun
attention tone is intentionally separate from the legacy `accent-*` ramp used
by generic shadcn-compatible components.

### Cards / Containers

- **Corner Style:** 32px for learning cards; 20px for compact controls; 36px or
  more for expressive route panels.
- **Background:** Surface white at rest, sea-glass wash for selected or
  supporting areas, and a mint-to-paper gradient for icon or milestone blocks.
- **Shadow Strategy:** Follow the Soft-Lift Rule; use tactile offset shadows only
  on progress and pressable components.
- **Border:** 1px Soft Border at rest, with a deeper green boundary on focus or
  selected states.
- **Internal Padding:** 20px for compact cards, 24–28px for primary learning
  cards, and 32px for larger route surfaces.

Student catalogue cards use the shared `StudentCatalogueCard` geometry with an
explicit content variant. `materi` is the wide progress row (icon, content,
action); `kuis` is the subject tile with a fixed reading height; and `tryout`
is the artwork-first card with the same radius, border, lift, and focus
treatment. Content-specific artwork and status treatments may vary, but the
outer card contract should not.

### Inputs / Fields

- **Style:** 44px minimum height, 20px corners, white or pale mint fill, and a
  quiet border.
- **Focus:** A visible 3px green-tinted ring and a slightly stronger border;
  never rely on a color change alone.
- **Error / Disabled:** Keep the same geometry, reduce opacity only for
  disabled controls, and use a clear message plus an additional state cue for
  errors.

### Navigation

- **Style:** White sidebar with a collapsible icon mode and compact group labels.
  The active item uses a pale mint wash and deep green text/icon treatment.
- **Header:** Sticky, translucent canvas surface with a subtle bottom border and
  backdrop blur; search and account controls stay visually secondary to the
  page task.
- **Mobile:** Preserve the same active-state language in the sheet/drawer and
  keep labels readable when the sidebar collapses.

### Learning Journey Node

The signature Materi milestone uses a large rounded shape, a deep green or leaf
fill, a white outline, and an offset bottom shadow. A current-position voyage
illustration may sit above the node. Use it to show what is available, complete,
locked, or next; do not use it as a generic decorative badge.

## Do's and Don'ts

### Do:

- **Do** use Voyage Deep for the primary action and the clearest progress cue.
- **Do** pair deep green anchors with sea-glass gradients so the page feels
  bright without losing structure.
- **Do** use illustration, tilt, and motion when they clarify progress, state,
  or the next step.
- **Do** keep body copy calm, readable, and comfortably spaced beneath bold
  headings.
- **Do** carry the same tactile language into Kapten and admin surfaces while
  reducing decorative density for operational work.

### Don't:

- **Don't** turn the product into a generic admin panel of dense tables, tiny
  labels, or analytics-first blocks.
- **Don't** over-gamify the experience with cartoon overload, noisy rewards, or
  decoration that competes with learning tasks.
- **Don't** use green gradients as low-contrast text backgrounds or as noise on
  every surface.
- **Don't** copy the Materi zig-zag road onto screens whose job is editing,
  reviewing, or managing content.
- **Don't** use a capsule badge with a leading status dot for full-sentence
  empty, error, unavailable, or not-found messages.
- **Don't** remove the tactile hover, focus, and press cues from interactive
  learning controls without replacing them with an equally clear state signal.

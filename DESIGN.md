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

**The Plain Page-Title Rule.** Use one short noun phrase as the page-level
title, naming the current workspace or destination directly (for example,
“Tryout Workspace”). Do not stack an eyebrow or overline above it and a
subtitle or description below it by default. If guidance is necessary, place
it in the task content instead of turning the title block into a multi-line
introduction.

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

Buttons use three intentional families. The family follows the surface and
the user's job; it is not chosen ad hoc by route.

- **Workspace / admin:** Use 12px corners, a 44px default height, and the
  shared `button-primary`, `button-outline`, or ghost variants. Primary is
  Voyage Deep with white text. Outline is a white surface with a 1px Soft
  Border and Ink text. Ghost controls are transparent at rest and use a
  Sea-Glass Wash hover state. Compact utilities may use 40px or 36px only
  when the surrounding density makes the reduced target clear; important
  actions stay at least 44px.
- **Marketing / onboarding:** Use the pill silhouette for high-confidence
  entry and conversion actions. Marketing hero actions are typically 56px;
  compact header actions are 44px. Onboarding uses Warm Sun with Warm-Sun Ink
  for the main step action, while its secondary “skip” action remains a quiet
  text control. These pills do not spread into ordinary workspace screens.
- **Learning journey:** Use Voyage Forest or Voyage Deep for primary progress
  actions. Larger 20–36px corners and tactile offset shadows are reserved for
  journey nodes, completion, and other progress landmarks. Warm Sun is the
  attention/skip cue, not a second everyday primary.
- **Shared states:** Every family keeps an explicit green-tinted focus ring,
  a visible disabled treatment, and a short tonal or lift response on hover.
  Learning actions may add a short downward press; reduced motion removes
  translation while preserving color, border, and loading-state changes.
- **Compact utility preference:** For familiar, repeated utility actions such
  as search, close, edit, preview, and more-actions, prefer an icon-only button
  with the shared `Tooltip`, `TooltipTrigger`, and `TooltipContent` primitives
  over a lengthy text button. The icon should communicate the action clearly;
  the tooltip should name the outcome, not just the icon.
- **When text stays visible:** Keep a visible text label for primary,
  destructive, unfamiliar, onboarding, or high-consequence actions. A tooltip
  is supporting guidance, not a reason to hide an action whose meaning is not
  immediately recognizable.
- **Icon-only accessibility:** Every icon-only trigger needs an explicit
  `aria-label`, visible keyboard focus, and a touch target of at least 44px.
  Compact utility controls may use the shared 40px size only when the
  surrounding density and spacing keep the target clear. Do not rely on a
  browser `title` or hover-only tooltip as the accessible name.
- **Labeling:** Use a verb-led label that describes the result (“Mulai
  belajar”, “Simpan”, “Lihat program”). Keep one primary action per group and
  let secondary/ghost controls recede through surface and border treatment.

### Chips

- **Style:** Compact, fully rounded labels with sea-glass wash and deep green
  text; status variants may use a pale warm-sun wash for drafts.
- **State:** Keep selected/active chips visibly stronger through background,
  border, or weight—not color alone.
- **Boundary:** Never use a chip or badge for a sentence or an empty, error,
  unavailable, or not-found message; use inline copy or a contextual state
  block instead.

### Tabs

Vecalss has exactly two visual tab variants. The number of tabs in a group can
vary, but every tab group must choose one of these two patterns rather than
introducing a third treatment.

- **Variant 1 — compact filter tabs:** Use a fit-content, horizontal row of
  pill-shaped triggers for filters or categories within one collection, as on
  `/tryout` (“Semua”, “Tryout saya”, “Selesai”, “Latihan”). The active trigger
  uses Voyage Deep with white text; inactive triggers use the quiet context
  treatment. Let the row scroll horizontally on narrow screens instead of
  forcing each filter to equal width.
- **Variant 2 — full-width line tabs:** Prefer this variant whenever the tab
  bar should span the available width or switch between peer workspace areas,
  as on `/vera-ai` (“Percakapan”, “Konteks”, “Studio”). Use equal-width
  triggers, a transparent background, muted inactive text, and a visible
  Voyage Deep underline for the active tab. Icons are allowed when they help
  distinguish workspace areas, but they must remain secondary to the label.
- **Shared behavior:** Use semantic tabs with one clearly selected state,
  visible keyboard focus, readable labels, and a minimum 44px touch target.
  Variant 2 is the preferred default for full-width layouts; Variant 1 is for
  compact, content-sized filtering.

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

### Dropdowns / Menus

Use the shared custom `DropdownMenu` family from
`components/ui/dropdown-menu.tsx` for product menus, filters, sort choices,
and action lists. Avoid raw browser-native `<select>` elements and one-off
dropdown markup in ordinary product UI; they bypass the Vecalss geometry,
colors, focus treatment, and interaction behavior. If a value-selection flow
needs listbox or combobox semantics rather than menu semantics, extend the
shared primitive or add a reusable shared wrapper instead of falling back to a
browser-default control. Native controls are an exception only when a
platform-specific requirement is documented.

- **Trigger:** Use a clearly labeled trigger with the shared button geometry,
  visible focus, and at least a 44px touch target.
- **Menu:** Use the shared portal, surface, radius, shadow, spacing, and
  highlighted/selected states; do not restyle each screen with a competing
  dropdown language.
- **Behavior:** Preserve keyboard navigation, Escape-to-close, outside-click
  dismissal, correct menu/listbox semantics, and readable selected state.

### Tables / Data Grids

The approved Vecalss operational table is the shared `DataTable` plus `Table`
implementation from `components/ui/data-table.tsx` and
`components/ui/table.tsx`. Treat these routes as the visual and interaction
references before creating a new table shell:

| Approved reference | Use it for | Signature behavior |
| --- | --- | --- |
| `/admin/enrollment` | Student directory | Search, multi-status/date filters, sortable columns, row selection and bulk actions, detail preview, pagination, and a clear empty state. |
| `/admin/kapten` | Kapten directory | Search/status filtering, sortable columns, clickable rows with a detail sheet, status treatment, and pagination. |
| `/mentor/quiz/question-bank` | Kapten Bank Soal catalogue | Folder and bank rows in one grid, breadcrumb/header actions, subject/category/status filters, sorting, row action menus, and dense-column overflow. |

- **Frame:** Render the table inside the approved white `rounded-2xl`
  surface. Use `DataTable` for the toolbar, filter chips, sortable header,
  row states, empty state, and responsive overflow; use `Table` primitives for
  semantic markup.
- **Geometry:** Keep the muted `secondary-50/80` header, 44px header controls,
  compact labels, `px-4 py-3.5` cells (`sm:px-5`), soft `primary-100`
  separators, and a compact minimum width appropriate to the column set
  (`760px` for directories and the Bank Soal catalogue). Keep per-column
  minimums modest, truncate long names and categories, and allow horizontal
  overflow only when the available container cannot satisfy those minimums.
- **States:** Use `secondary-50/70` row hover, `primary-50` selected/focused
  treatment with a visible focus cue, and readable dot-plus-text status states.
  Keep empty and error messaging in the table content flow rather than in
  sentence-length badges.
- **Behavior:** Preserve accessible search, filtering, sorting, and
  pagination. Sortable headers expose a visible direction indicator and
  `aria-sort`; row actions stay keyboard reachable; selection and bulk actions
  are explicit and scoped to the visible rows. Keep canonical filtering,
  sorting, and pagination server-backed.
- **Responsive:** Let dense grids scroll horizontally inside the table
  container; wrap toolbar controls while keeping primary actions reachable. Do
  not invent a competing card-per-row or mobile-only table language unless the
  data density genuinely cannot work in this pattern.
- **Boundary:** This is the approved pattern for admin, Kapten, and catalogue
  operations. It does not replace cards, compact lists, or learning-journey
  surfaces.

### TanStack interaction patterns

Vecalss uses TanStack selectively as a headless behavior layer, not as a visual
system. The current stack includes `@tanstack/react-form` for forms that need
typed values, field-level validation, touched state, or submission feedback.
The admin audit-log table also uses `@tanstack/react-table` for current-page
sorting while the server remains responsible for the canonical query and URL
pagination. TanStack Query should be introduced only when a surface has real
client-side server-state synchronization to manage.

- **Keep the boundary narrow:** Place TanStack Form inside the smallest
  interactive Client Component. Keep the surrounding page, copy, and static
  imagery as Server Components so the landing page does not ship unnecessary
  client JavaScript.
- **Reuse Vecalss primitives:** Bind TanStack fields to the existing `Field`,
  `FieldInput`, `FieldTextarea`, radio, and button primitives. TanStack owns
  values and validation; the design system still owns geometry, color, focus,
  motion, and copy.
- **Validate at the right moment:** Prefer blur or submit validation for
  marketing and onboarding forms. Avoid showing an error on every keystroke
  unless the immediate feedback prevents a costly mistake.
- **Make state perceivable:** Invalid fields need `aria-invalid`, a stable
  `aria-describedby` reference, and an adjacent readable error. Submission
  progress and completion need a visible label plus an `aria-live` region.
- **Do not fake persistence:** TanStack Form may manage a local prototype state,
  but a production submit must hand off to a Next.js Server Action or route
  handler and render the server result. Never present a local acknowledgement
  as if a lead, enrollment, or other record was stored.
- **Keep table behavior headless:** TanStack Table owns row models and sorting
  state; Vecalss table primitives still own markup, spacing, color, focus, and
  responsive overflow. Sort controls need an accessible label, a visible
  direction indicator, and `aria-sort` on the matching header.
- **Respect the data boundary:** When pagination is server-owned, label local
  sorting as sorting the current page. Promote sorting or filtering into the
  server query only when the product needs results across the full dataset.
- **Do not force TanStack onto static UI:** Navigation, FAQ disclosure, cards,
  marquees, and illustration-led sections should stay with native links,
  existing primitives, or focused local state. A library is justified by the
  interaction model, not by the presence of a component.

### Navigation

- **Style:** White sidebar with a collapsible icon mode and compact group labels.
  The active item uses a pale mint wash and deep green text/icon treatment.
- **Header:** Sticky, translucent canvas surface with a subtle bottom border and
  backdrop blur; search and account controls stay visually secondary to the
  page task.
- **Back control:** Use a single visually icon-only chevron-left control for
  child pages. It must link to the immediate parent route in the page
  hierarchy, never skip from a child to a grandparent or broad catalogue
  destination. Give the control an accessible name such as “Kembali ke
  {parent}” and keep the touch target at least 44px.
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
- **Do** make page titles direct and concise: name the current destination once,
  such as “Tryout Workspace.”
- **Do** use a chevron-left back control that returns exactly one level to the
  immediate parent, with an accessible parent-specific name.
- **Do** choose between the two tab variants by layout intent: Variant 1 for
  compact filters and Variant 2 for full-width peer workspaces.
- **Do** reuse the shared `DropdownMenu` family for menus, filters, sorting,
  and action lists instead of reaching for browser-native dropdowns.
- **Do** prefer icon-only buttons with the shared tooltip for familiar compact
  utilities, while keeping visible text for primary or ambiguous actions.
- **Do** carry the same tactile language into Kapten and admin surfaces while
  reducing decorative density for operational work.
- **Do** choose the button family from the surface: pill for marketing and
  onboarding, compact rounded controls for workspace/admin, and tactile
  larger-corner controls for learning progress.
- **Do** keep button colors, borders, focus rings, and disabled states on named
  tokens or shared variants; if a new exception is needed, name it first.

### Don't:

- **Don't** turn the product into a generic admin panel of dense tables, tiny
  labels, or analytics-first blocks.
- **Don't** over-gamify the experience with cartoon overload, noisy rewards, or
  decoration that competes with learning tasks.
- **Don't** use green gradients as low-contrast text backgrounds or as noise on
  every surface.
- **Don't** build page headers from an eyebrow, title, and subtitle/description
  stack when the title alone communicates the destination.
- **Don't** make Back jump from a child page to its grandparent, a broad
  catalogue, or an arbitrary history entry.
- **Don't** invent a third tab style or use Variant 1 when a tab bar needs to
  span the full available width.
- **Don't** use a raw `<select>` or one-off dropdown implementation when the
  shared custom dropdown primitive can express the interaction.
- **Don't** replace a consequential or ambiguous text action with an icon-only
  control whose meaning depends on hover or a tooltip.
- **Don't** copy the Materi zig-zag road onto screens whose job is editing,
  reviewing, or managing content.
- **Don't** use a capsule badge with a leading status dot for full-sentence
  empty, error, unavailable, or not-found messages.
- **Don't** remove the tactile hover, focus, and press cues from interactive
  learning controls without replacing them with an equally clear state signal.
- **Don't** use marketing pills as the default shape for admin, Kapten, or
  student workspace actions.
- **Don't** make a secondary action look like a primary by mixing strong dark
  borders, solid fills, and equal emphasis in the same action group.
- **Don't** hard-code route-specific button hex values when an existing family
  token already expresses the intended meaning.

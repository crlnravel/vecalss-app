# Components

Use this file when selecting or extending a shared UI component.

[Back to the design-system index](../../DESIGN.md)

## Buttons

Buttons use three intentional families. The family follows the surface and
the user's job; it is not chosen ad hoc by route.

- **Workspace / admin:** Use 12px corners, a 44px default height, and the
  shared `button-primary`, `button-outline`, or ghost variants. Primary is
  Voyage Deep with white text. Outline is a white surface with a 1px Soft
  Border and Ink text. Ghost controls are transparent at rest and use a
  Sea-Glass Wash hover state. Compact utilities may use 40px or 36px only
  when the surrounding density makes the reduced target clear; important
  actions stay at least 44px.
- **Primary action depth:** Workspace and admin primary actions across Student,
  Mentor, Admin, and Affiliator surfaces use the shared elevated `brand`
  variant. Its restrained offset edge, soft lift on hover, and press response
  make the action feel pressable without turning secondary links, outline
  controls, or section navigation into primary actions. Route modules should
  consume the shared variant rather than recreating its shadow.
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

## Chips

- **Style:** Compact, fully rounded labels with sea-glass wash and deep green
  text; status variants may use a pale warm-sun wash for drafts.
- **State:** Keep selected/active chips visibly stronger through background,
  border, or weight—not color alone.
- **Boundary:** Never use a chip or badge for a sentence or an empty, error,
  unavailable, or not-found message; use inline copy or a contextual state
  block instead.

## Tabs

Vecalss has exactly two visual tab variants. The number of tabs in a group can
vary, but every tab group must choose one of these two patterns rather than
introducing a third treatment.

- **Variant 1 — compact filter tabs:** Use a fit-content, horizontal row of
  pill-shaped triggers for filters or categories within one collection, as on
  `/tryout` (“Semua”, “Tryout saya”, “Selesai”, “Latihan”). The active trigger
  uses Voyage Deep with white text and the shared sunken inset effect; inactive
  triggers use the quiet context treatment. The recessed depth is reserved for
  the active compact filter state. Let the row scroll horizontally on narrow
  screens instead of forcing each filter to equal width.
- **Variant 2 — full-width line tabs:** Prefer this variant whenever the tab
  bar should span the available width or switch between peer workspace areas,
  as on `/vera-ai` (“Percakapan”, “Konteks”, “Studio”). Use equal-width
  triggers, a transparent background, muted inactive text, and a visible
  Voyage Deep underline for the active tab; keep this variant flat rather than
  applying the compact tab's sunken inset. Icons are allowed when they help
  distinguish workspace areas, but they must remain secondary to the label.
- **Shared behavior:** Use semantic tabs with one clearly selected state,
  visible keyboard focus, readable labels, and a minimum 44px touch target.
  Variant 2 is the preferred default for full-width layouts; Variant 1 is for
  compact, content-sized filtering.

## Tooltips

- **Shared tooltip surface:** Use the shared `Tooltip`, `TooltipTrigger`, and
  `TooltipContent` primitives. The content uses a pale Voyage Surface fill, a
  1px Voyage Deep outline, Voyage Deep text, a soft green shadow, and a
  matching outlined arrow. Do not use a solid dark-green tooltip background.
- **Chart hover summaries:** `ChartTooltipContent` follows the same pale
  surface, green outline, green text, and soft green shadow so chart hover
  summaries do not introduce a second tooltip language. The chart summary
  does not need the standard tooltip arrow.
- **Scope:** This applies to compact icon actions, collapsed navigation labels,
  contextual hints, and chart summaries across Student, Mentor, Admin, and
  Affiliator surfaces. Keep tooltip copy concise and never use it as the only
  label for an unfamiliar or high-consequence action.

## Student status tokens

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

## Cards / Containers

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

## Inputs / Fields

- **Style:** 44px minimum height, 20px corners, white or pale mint fill, and a
  quiet border.
- **Focus:** A visible 3px green-tinted ring and a slightly stronger border;
  never rely on a color change alone.
- **Error / Disabled:** Keep the same geometry, reduce opacity only for
  disabled controls, and use a clear message plus an additional state cue for
  errors.
- **Required / optional labeling:** Mandatory fields show a red `*` in the
  visible label through the shared `FieldLabel required` contract, with an
  assistive-text equivalent for screen readers. Do not add `(optional)` helper
  text: the absence of the red asterisk communicates that a field is optional.
  Keep the visual marker, native `required` attribute, and validation rules in
  sync.

### Settings-style field labels and control families

Mentor settings and the embedded Tryout detail workspace share one field
contract. Use the exported `REFERENCE_FIELD_LABEL_CLASS_NAME` for the visible
label above every settings-style control. Keep the label compact and muted;
the value, option, or action text inside the control remains readable at the
normal body size.

Use the shared control token for the control family instead of recreating its
geometry in a route module:

| Control family | Shared implementation | Contract |
| --- | --- | --- |
| Text, number, date, search, and textarea | `REFERENCE_CONTROL_CLASS_NAMES.input` | Pale mint surface, 44px minimum height, 20px corners, inset depth, and a visible green focus ring. Add only field-specific sizing such as a textarea minimum height. |
| Select and dropdown | `ReferenceSelect`, `DropdownField`, or a custom listbox trigger with `REFERENCE_CONTROL_CLASS_NAMES.select` | Keep the visible label above the trigger; preserve keyboard navigation, selected state, and the shared popup surface. |
| Radio or checkbox choices | `RadioGroup` / `Checkbox` inside a `REFERENCE_CONTROL_CLASS_NAMES.choice` surface | Apply the reference surface to the choice row, use a visible focus-within ring, and keep option labels at `text-sm` or larger. The group label uses the compact settings label token. |
| File and media | A keyboard-accessible visible trigger with `REFERENCE_CONTROL_CLASS_NAMES.file` plus a native `input[type="file"]` kept `sr-only` | The trigger names the action (`Pilih gambar`, `Ganti gambar`, or `Upload gambar`), remains at least 44px high, and exposes disabled/uploading state without hiding the input semantics. |

For every family, pair the label with the control through `htmlFor`/`id` when
the primitive supports it. Do not make a radio option or checkbox value look
like the compact field label: the group label establishes the field, while
the option text explains the choice. Selected, invalid, disabled, and
uploading states must retain the same geometry and a non-color cue.

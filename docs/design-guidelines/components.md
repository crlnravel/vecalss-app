# Components

Use this file when selecting or extending a shared UI component.

[Back to the design-system index](../../DESIGN.md)

## Buttons

Use one shared tactile `Button` family on every surface. The approved
`variant` values are `default` (primary), `outline` (secondary),
`destructive`, `warning`, and `inverse` (on dark surfaces). All five have
the same restrained offset edge, hover lift, and press response. Primary
hierarchy comes from color and contrast, not a competing flat button family.

- **Geometry:** Every Button uses `rounded-control` (12px).
  Sizes are `sm` (40px, dense utilities only), `default` (44px),
  `lg` (48px), `icon-sm` (40px), `icon` (44px), and `icon-lg` (48px).
  Size changes geometry, never tone or corner style. Main and touch actions
  stay at least 44px; enlarge the hit area when a dense utility uses 40px.
  The navbar avatar trigger uses `rounded-pill` as the circular identity
  composition described below, while retaining the canonical tactile recipe.
- **States:** Keep visible focus, disabled and loading cues, and consistent
  hover/press behavior. Reduced motion removes transforms and transitions
  while preserving color, border, focus, and loading state.
- **Use by intent:** Save/start/submit uses primary; cancel/back/secondary uses
  outline; destructive mutations use destructive; exceptional attention uses
  warning. Inverse provides a readable white action on a dark surface.
- **Navigation and filters:** Ordinary text links remain links. Collections
  use specialty tabs, rather than a selected Button variant. Menu items and
  field selectors keep their own semantics and shared geometry.
- **Retired:** `brand`, `brandOutline`, `reference`, `ghost`,
  `secondary`, `link`, context, marketing, onboarding, learning, and
  separate attention variants are removed after consumer migration. Do not
  retain compatibility exports or reintroduce them as route-local classes.
- **Utilities:** Prefer a familiar icon plus shared Tooltip for search, close,
  edit, preview, and more-actions. Every icon-only Button needs an explicit
  accessible name and visible keyboard focus. Keep visible text for primary,
  destructive, unfamiliar, and high-consequence actions.
- **Labels:** Use a verb describing the result (“Mulai belajar”, “Simpan”,
  “Lihat program”). Keep one primary action per group.

## Badges and chips

`Badge` is the single app-wide compact metadata primitive, using the former
StudentBadge appearance and existing `student-status-*` semantic tokens.
It applies equally to Student, Mentor, Admin, Affiliator, and public surfaces.
The token prefix is historical; it does not restrict audience.

- **Contract:** `tone` is category, neutral, active, attention, success, info,
  or danger. `size` is xs, sm, or md. `depth` is flat or sunken, with sunken
  as the default. Use `rounded-pill` consistently.
- **Meaning:** Category names content; neutral labels passive metadata; active
  marks current progress; attention flags upcoming/unread/review states;
  success marks meaningful completion; info marks informational/practice
  context; danger marks failure or an incorrect result.
- **Boundary:** Badges are short metadata, never page headings, complete
  sentences, empty/error messages, or standalone notification alerts.
  Marketing headings formerly wrapped in a general Badge become plain heading
  text. Keep selected metadata discernible beyond color alone.
- **Retired:** The old general Badge variant/heading-size API, StudentBadge,
  MentorBadge, and audience-specific badge geometry are removed after all
  consumers migrate. Status helpers may map domain states to canonical Badge
  tones; they must not own a separate style.

## Avatars

Use the shared `Avatar`, `AvatarImage`, and `AvatarFallback` composition,
following the [ReUI avatar reference](https://reui.io/components/avatar).

- **Geometry:** Circular `rounded-pill`; `sm` is 24px, `default` is 32px,
  and `lg` is 40px in exact CSS pixels. Profile editors may use an explicit
  larger size without creating a separate avatar style.
- **Identity:** Real available images use meaningful alt text and fall back
  to initials when unavailable or failed. Use Sea-Glass Wash and Voyage Deep
  for the shared fallback, with a quiet semantic border. Do not create
  route-specific fallback palettes or gradients.
- **Navbar:** All account menus consume the shared Avatar inside a named,
  circular 44px tactile outline trigger. Preserve account switching, menu
  keyboard behavior, and logout confirmation. Display initials when the
  account contract has no photo; never insert a sample user image.
- **Groups and status:** Keep shared AvatarGroup, AvatarGroupCount, and
  AvatarBadge helpers. Presence indicators require real presence data; a
  static identity avatar must not imply that a user is online.
- **Library contract:** Preserve Base UI loading/fallback behavior and
  state-derived class callbacks on Root, Image, and Fallback.

## Tabs

Specialty tabs are the standard across the app. Use one shared sunken trigger
treatment with two layouts: content-sized filters and equal-width peer
navigation. Generic filled tabs and line/underline styles are retired.

- **Compact filters:** Use `CompactFilterTabs` for a collection filter group
  or the compact semantic tab list/trigger helpers for content panels. Allow
  horizontal scrolling on narrow screens.
- **Peer panels:** Use `FullWidthTabsList` / `FullWidthTabsTrigger` for an
  equal-width row. The former FullWidthLineTabs name is retired because the
  treatment no longer has an underline.
- **Canonical tabs:** `Tabs`, `TabsContent`, `TabsList`, and
  `TabsTrigger` provide panel semantics; list/trigger use the same specialty
  treatment, with `layout="content" | "equal"`, without a visual
  `variant` prop. Preserve orientation and library keyboard behavior.
- **Route and button groups:** Use the SunkenTab link/button/navigation
  helpers for their native semantics. A collection filter is a pressed button
  group, a route link is navigation with `aria-current`, and content panels
  are semantic tabs.
- **Mode choices:** ModeCardTabs may preserve its icon/description item API
  where authoring needs it, but consumes the same sunken selection and control
  radius. It must not create another card/underline tab family.
- **Shared geometry and state:** 12px `rounded-control`, 8px gap, and 44px
  minimum target. At rest use a 1px Soft Border; selected state has a full
  Voyage Deep border, Sea-Glass Wash fill, Voyage Deep text, and inset depth.
  Keep visible focus, readable labels, disabled state, and reduced motion.

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


## Cards / Containers

- **Corner Style:** `rounded-card` (32px) for bounded cards and table frames;
  `rounded-field` (20px) for compact field surfaces; `rounded-panel` (36px)
  for dialogs, sheets, sidebar shells, and large route panels.
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

- **Style:** 44px minimum height, `rounded-field` (20px), white or pale mint fill, and a
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

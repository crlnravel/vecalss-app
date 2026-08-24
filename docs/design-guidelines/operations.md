# Operational patterns

Use this file for admin, Kapten, catalogue, and data-heavy interactions.

[Back to the design-system index](../../DESIGN.md)

## Dropdowns / Menus

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

## Tables / Data Grids

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
- **Responsive:** Avoid horizontal scrolling by default. Use sensible
  per-column minimums and truncate long names and categories; reserve overflow
  for cases where truncation would materially harm comprehension or
  actionability. When overflow is necessary, keep it inside the table
  container, wrap toolbar controls, and keep primary actions reachable. Do not
  invent a competing card-per-row or mobile-only table language unless the data
  density genuinely cannot work in this pattern.
- **Boundary:** This is the approved pattern for admin, Kapten, and catalogue
  operations. It does not replace cards, compact lists, or learning-journey
  surfaces.

### Operational table empty states

Use this rule for every approved operational table when its query returns no
rows. The empty state is table content, not a synthetic record.

- **Span the table:** Render one empty-state cell across the full table width,
  including any `Aksi`/action column. The action column must not render
  placeholder cells, disabled controls, or row action buttons because there is
  no record to act on.
- **Keep the row neutral:** Render the empty row without hover tint
  (`hover:bg-transparent`). An empty row has no record to highlight, select, or
  imply as interactive.
- **Center the whole message:** Center the no-content indicator, title,
  supporting copy, and any actions within the available table viewport, not
  only within a fixed content width. Keep the content wrapper horizontally
  centered with a responsive maximum width so long copy does not force the
  table wider.
- **Protect narrow screens:** Preserve centering on narrow viewports with a
  `max-width` tied to the available viewport and a wrapping action row. Actions
  remain centered and reachable without introducing a second mobile-only
  layout or horizontal drift.
- **Put recovery in the empty state:** A create, clear-filter, retry, or other
  recovery CTA belongs inside the centered empty-state content only when it is
  useful for that context. It must never be rendered as a row action or as a
  placeholder in the `Aksi` column.
- **Keep the action hierarchy:** When an empty state needs actions, retain a
  clear primary/secondary hierarchy and keep the action row centered. Omit
  actions when none are useful; do not invent record-level actions for an empty
  result.

### Bank Soal placeholder

Use `/mentor/quiz/question-bank` as the approved catalogue empty-state
reference:

- **Composition:** Keep the placeholder inside the white table frame and the
  table’s empty row. Center a compact stack with a small content icon (the
  current reference uses `LibraryBig` at `size-7` in `primary-300`), a concise
  heading in `secondary-900`, and one short description in muted text. Keep the
  copy within a viewport-safe width such as `calc(100vw - 2rem)` and let it
  wrap naturally.
- **Quiet surface:** Do not add a second card, status badge, decorative tint,
  or sentence-length pill. The empty state should read as part of the table,
  not as a competing page panel.
- **State copy:** Distinguish a genuinely empty location from no matching
  search or filter results. A creation hint belongs only to the former; a
  search/filter empty state should explain that there are no matches and avoid
  sending the user toward unrelated creation.
- **Action rule:** Show `Buat bank soal`, `Buat folder`, clear-filter, retry, or
  another action only when it directly resolves the current empty state and is
  available to the user. If there is no meaningful next action—because the
  view is read-only, system-managed, permission-limited, or simply has no
  recovery path—render no action buttons at all. Never show disabled or
  decorative placeholders for actions the user cannot take.

## TanStack interaction patterns

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

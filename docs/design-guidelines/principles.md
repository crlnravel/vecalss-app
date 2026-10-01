# Do's and Don'ts

Use this file before introducing a new pattern or visual exception.

[Back to the design-system index](../../DESIGN.md)

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
- **Do** choose the shared sunken tabs layout by intent: content-sized tabs for
  compact filters and equal-width tabs for full-width peer workspaces.
- **Do** reuse the shared `DropdownMenu` family for menus, filters, sorting,
  and action lists instead of reaching for browser-native dropdowns.
- **Do** use the shared top-center Sonner toast for every notification
  alert; keep field validation, blocking recovery content, and confirmation
  decisions in their proper task context.
- **Do** use a persistent, lifecycle-managed Sonner notice for unsaved changes,
  saving and edit locks. Clear it on resolution and navigation; never duplicate
  it as inline page status text or a custom fixed bar.
- **Do** default to silence for flawless entries, reserving status color and
  iconography for attention states or meaningful user-triggered outcomes.
- **Do** use a quiet centered empty-state placeholder and offer only actions
  that directly resolve the current empty state.
- **Do** prefer icon-only buttons with the shared tooltip for familiar compact
  utilities, while keeping visible text for primary or ambiguous actions.
- **Do** carry the same tactile language into Kapten and admin surfaces while
  reducing decorative density for operational work.
- **Do** use one tactile Button family and the 12px control radius everywhere;
  keep secondary actions quieter through tone and contrast.
- **Do** use the app-wide Badge based on the former StudentBadge treatment,
  with shared semantic tones and sizes across every audience.
- **Do** use named semantic radius utilities instead of arbitrary corners or
  audience-specific component geometry.
- **Do** use a red asterisk for mandatory field labels and omit `(optional)`
  helper text; no asterisk communicates an optional field.
- **Do** use the pale, green-outlined tooltip treatment for shared tooltips and
  chart hover summaries, including collapsed navigation hints.
- **Do** use the shared sunken treatment for both compact filters and
  full-width navigation, with a 1px border at rest and a full Voyage Deep border
  around the selected tab.
- **Do** keep button colors, borders, focus rings, and disabled states on named
  tokens or shared variants; if a new exception is needed, name it first.
- **Do** write user-facing labels and feedback in plain Indonesian. Name the
  user's task (“file soal”, “templat soal”, “Unduh soal”), not the implementation
  (“CSV v1”, “API”, “UUID”, “UTF-8”, “revision”).

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
- **Don't** invent another tab style or use content-sized tabs when a tab bar
  needs to span the full available width.
- **Don't** use a raw `<select>` or one-off dropdown implementation when the
  shared custom dropdown primitive can express the interaction.
- **Don't** use the retired inline Alert family or build page-local banners
  for notification outcomes; Sonner is the only notification alert surface.
- **Don't** add “Normal,” “Valid,” “Healthy,” or green checkmarks to routine
  fields, rows, or static data just to prove that nothing is wrong.
- **Don't** add disabled, irrelevant, or decorative action buttons to an empty
  state when the user has no meaningful next step.
- **Don't** replace a consequential or ambiguous text action with an icon-only
  control whose meaning depends on hover or a tooltip.
- **Don't** copy the Materi zig-zag road onto screens whose job is editing,
  reviewing, or managing content.
- **Don't** use a capsule badge with a leading status dot for full-sentence
  empty, error, unavailable, or not-found messages.
- **Don't** remove the tactile hover, focus, and press cues from interactive
  learning controls without replacing them with an equally clear state signal.
- **Don't** reintroduce flat, marketing, onboarding, or audience-specific
  Button or Badge families, or generic filled/underline tab styles.
- **Don't** use a solid dark-green tooltip background or create a route-local
  tooltip style that bypasses the shared green-outlined treatment.
- **Don't** make a secondary action look like a primary by mixing strong dark
  borders, solid fills, and equal emphasis in the same action group.
- **Don't** hard-code route-specific button hex values when an existing family
  token already expresses the intended meaning.
- **Don't** expose implementation details, version markers, raw file-format
  terms, internal IDs, or backend error codes in user-facing UI; translate them
  into a clear next step.

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
- **Do** choose between the two tab variants by layout intent: Variant 1 for
  compact filters and Variant 2 for full-width peer workspaces.
- **Do** reuse the shared `DropdownMenu` family for menus, filters, sorting,
  and action lists instead of reaching for browser-native dropdowns.
- **Do** use the shared bottom-center Sonner toast for transient success and
  failure feedback, with its `success` and `error` variants.
- **Do** default to silence for flawless entries, reserving status color and
  iconography for attention states or meaningful user-triggered outcomes.
- **Do** use a quiet centered empty-state placeholder and offer only actions
  that directly resolve the current empty state.
- **Do** prefer icon-only buttons with the shared tooltip for familiar compact
  utilities, while keeping visible text for primary or ambiguous actions.
- **Do** carry the same tactile language into Kapten and admin surfaces while
  reducing decorative density for operational work.
- **Do** choose the button family from the surface: pill for marketing and
  onboarding, compact rounded controls for workspace/admin, and tactile
  larger-corner controls for learning progress.
- **Do** use the shared elevated primary action in workspace, Mentor, Admin,
  and Affiliator surfaces; keep secondary and navigation controls visually
  quieter.
- **Do** use a red asterisk for mandatory field labels and omit `(optional)`
  helper text; no asterisk communicates an optional field.
- **Do** use the pale, green-outlined tooltip treatment for shared tooltips and
  chart hover summaries, including collapsed navigation hints.
- **Do** give active compact filter tabs the sunken inset treatment, while
  keeping full-width line tabs flat with a Voyage Deep underline.
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
- **Don't** build a page-local in-content toast for transient operation results
  when the shared bottom-center Sonner toast can communicate them.
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
- **Don't** use marketing pills as the default shape for admin, Kapten, or
  student workspace actions.
- **Don't** use a solid dark-green tooltip background or create a route-local
  tooltip style that bypasses the shared green-outlined treatment.
- **Don't** make a secondary action look like a primary by mixing strong dark
  borders, solid fills, and equal emphasis in the same action group.
- **Don't** hard-code route-specific button hex values when an existing family
  token already expresses the intended meaning.

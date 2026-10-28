# Navigation and learning journey

Use this file for page hierarchy, shell navigation, and Materi progress surfaces.

[Back to the design-system index](../../DESIGN.md)

## Navigation

- **Style:** White sidebar with a collapsible icon mode and compact group labels.
  The active item uses a pale mint wash and deep green text/icon treatment.
- **Header:** Sticky, translucent canvas surface with a subtle bottom border and
  backdrop blur; search and account controls stay visually secondary to the
  page task.
- **No back chevron:** Do not render a chevron-left or arrow-left back button
  anywhere in the app. The header breadcrumb is the way back. Child pages add
  their immediate parent as a crumb (for example Tryout › {title} ›
  Pengerjaan), never skipping to a grandparent or broad catalogue. The
  breadcrumb stays visible on mobile: it hides the root crumb when a parent
  crumb exists and truncates long labels.
- **Pages without a breadcrumb:** Full-screen editors and standalone flows that
  have no header breadcrumb use a plain text button labelled “Kembali” (outline,
  or inverse on a dark header) with a parent-specific accessible name such as
  “Kembali ke detail Kuis”. Never add an icon to it.
- **Directional arrows stay:** Pagination, calendar, carousel, sidebar collapse
  and previous/next question or step controls keep their arrows. They move
  within a set; they do not leave the page.
- **Mobile:** Preserve the same active-state language in the sheet/drawer and
  keep labels readable when the sidebar collapses.

## Learning Journey Node

The signature Materi milestone uses a large rounded shape, a deep green or leaf
fill, a white outline, and an offset bottom shadow. A current-position voyage
illustration may sit above the node. Use it to show what is available, complete,
locked, or next; do not use it as a generic decorative badge.


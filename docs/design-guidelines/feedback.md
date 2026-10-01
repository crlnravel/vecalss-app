# Feedback and validation

Use this file to decide when the interface should speak, stay quiet, or demand attention.

[Back to the design-system index](../../DESIGN.md)

## Validation and feedback hierarchy

Treat attention as a scarce resource. A field, row, or record in its ordinary
state should stay visually quiet; the absence of an alert communicates that it
is usable. Do not label ordinary values “Normal,” “Valid,” “Healthy,” or
“Error-free,” and do not decorate them with a success icon, green tint, or
success border.

- **Silence is the default validation:** Use standard typography, neutral
  surfaces, and the component’s existing structural borders. Do not add
  status-specific badges, icons, backgrounds, or live announcements to routine
  static data.
- **Attention states:** Reserve high-contrast treatment for a real error,
  warning, review need, or consequential system change. Pair color with a
  concise text explanation and a visible non-color cue; explain the recovery
  path when the user can act.
- **Action feedback:** Use success styling for an immediate user-triggered
  outcome—such as save, submit, upload, or copy—or for a meaningful completed
  state that changes what the user can do next. Keep transient confirmation
  brief and always use the shared top-center Sonner surface for notification
  alerts. This rule governs status indicators, not the brand color
  of primary action buttons.
- **Complex-input exception:** Positive inline validation is appropriate when it
  prevents a costly mistake or unlocks the next step, such as password rules,
  username availability, or payment formatting. Show it only after enough input
  or clear user intent—not on first focus, an empty field, or an incomplete
  value—and never let it compete with the problem states.
- **Timing:** Validate after sufficient input or a meaningful user attempt,
  rather than interrupting the first keystrokes. Remove an error as soon as the
  correction is recognized so the interface never reports a stale failure.
- **Assistive technology:** Announce meaningful dynamic outcomes through the
  appropriate status or alert semantics, with complete context and a polite
  default. Do not create live regions for static “valid” states, and do not
  make screen readers repeat routine confirmations.

| Entry condition | UI treatment | Visual weight | Purpose |
| --- | --- | --- | --- |
| Normal / flawless | Standard text, neutral surface, existing structural borders; no status icon, tint, or badge. | Low — blends into the page | Keep routine reading fast and calm. |
| Warning / review needed | Attention token, concise label or icon, and a short explanation or next step. | Medium to high | Signal risk before it becomes an error. |
| Faulty / error | Danger token, high-contrast text, a message tied to the field or row, and a clear recovery path. | High — demands focus | Help the user locate and fix the problem. |
| Meaningful success / change | Brief shared Sonner toast after a user action; use success styling only when it confirms a consequential result. | Focused and temporary | Confirm the outcome without turning the page green. |

## Toasts / Notifications

For every notification alert, use the shared Sonner surface
from `components/ui/sonner.tsx`, mounted once in the root layout. Its approved
placement is floating and centered at the top of the viewport; use
`toast.success(...)`, `toast.error(...)`, or `showToast(..., { variant })`
instead of building a page-local in-content toast. This includes success,
failure, information, and warning notifications across every audience.

**The Toast-Only Alert Rule.** The inline `Alert`, `AlertTitle`,
`AlertDescription`, and `AlertAction` family is retired and removed from the
primitive library and developer catalogue. Do not replace it with a one-off
colored notification banner, a sentence badge, or a local toast implementation.
Use the shared `showToast`/`toast` helpers and the single root Toaster.

**Notification versus task content.** Field validation stays attached to the
field through `FieldError`, `aria-invalid`, and `aria-describedby`. Its visible
message uses the shared validation tooltip rather than an inline paragraph:
provide a named, visible error trigger, open on hover, keyboard focus and tap,
and retain the error text in an accessible description even while the tooltip
is closed. Do not make validation hover-only, remove native validation, or
turn field errors into page-status toasts. Clear the tooltip and accessible
error when the correction is recognized. Blocking
page/load/session states retain a calm `TypedRouteState`/Empty or task-specific
recovery section with an available next action. Confirmation dialogs retain
their decision and recovery copy. Those are task content, not alternative
notification alerts. AlertDialog is a confirmation primitive and is not removed.
Static status metadata may remain a Badge. Do not toast routine static data.

**Delivery.** Emit from the user action or a guarded state transition, never
during render. When a server result needs a client notification, use a narrow
client bridge and a stable event identity; deduplicate re-renders, Strict Mode,
and polling repeats. A retry or a new user action may emit a new outcome.

- **All lifecycle actions:** Publish, unpublish, archive, restore, open,
  admission, scheduling, invitation, and similar user-triggered status
  mutations use the shared toast for transient success and failure. Keep field
  validation, readiness blockers, blocking search/load states, persistent
  recovery instructions, and destructive confirmation copy in the page or
  dialog flow. Remove notification banners once their toast is emitted.

- **Variants:** The shared component provides `default`, `success`, `error`,
  `info`, and `warning` variants. Success uses the student-status success
  tokens; error uses the student-status danger tokens; info and warning remain
  supporting states rather than competing with primary actions.
- **Placement:** Keep notifications top-center, below the top safe
  area, with a constrained readable width on desktop and full-width insets on
  mobile. Allow dismissal, swipe dismissal, and a short automatic duration.
- **Geometry:** Use `rounded-field` (20px) for the toast surface and
  `rounded-control` (12px) for tactile toast action buttons.
- **Content:** State the outcome in one short sentence. Add a description or
  action only when it helps recovery; do not repeat the entire form or page
  message in the toast.
- **Accessibility:** Preserve the Sonner live-region behavior, an accessible
  close label, visible keyboard focus, and reduced-motion behavior. Keep field
  validation, persistent recovery instructions, destructive confirmations,
  empty states, and content users must read in the page flow.

## Dynamic page status

Use the shared persistent Sonner status hook for unsaved changes, saving,
background synchronization, and resource edit locks. Do not render these states
as inline sentences, header badges, custom fixed bars, or page-local banners.

- Keep one stable notice per state owner. Update it when the meaningful state
  changes; do not create another toast for each keystroke, render, or poll.
- Unsaved changes remain visible until saved, discarded, or reverted. A pending
  save updates that notice. Failed saving keeps the unsaved warning and recovery
  action available. Clean and ready states stay quiet.
- Persistent notices do not time out or permit dismissal while their underlying
  state remains active. Dismiss them on resolution and owner unmount, including
  navigation. Cleanup must be safe under React Strict Mode.
- Preserve save, discard and retry actions when moving a custom status bar to
  Sonner. Form submission still uses the real form and its validation.
- Preserve navigation guards, before-unload warnings, edit-lock permissions,
  field errors, blocking recovery details and confirmation dialogs. Static
  record metadata such as published/draft labels and meaningful progress data
  remain content; they are not extra notification messages.

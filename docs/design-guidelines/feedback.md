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
  brief and use the shared bottom-center Sonner surface when it does not belong
  in the content flow. This rule governs status indicators, not the brand color
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
| Meaningful success / change | Brief success toast or local status after a user action; use success styling only when it confirms a consequential result. | Focused and temporary | Confirm the outcome without turning the page green. |

## Toasts / Notifications

For transient success and failure feedback, prefer the shared Sonner surface
from `components/ui/sonner.tsx`, mounted once in the root layout. Its approved
placement is floating and centered at the bottom of the viewport; use
`toast.success(...)`, `toast.error(...)`, or `showToast(..., { variant })`
instead of building a page-local in-content toast.

- **Variants:** The shared component provides `default`, `success`, `error`,
  `info`, and `warning` variants. Success uses the student-status success
  tokens; error uses the student-status danger tokens; info and warning remain
  supporting states rather than competing with primary actions.
- **Placement:** Keep transient notifications bottom-center, above the safe
  area, with a constrained readable width on desktop and full-width insets on
  mobile. Allow dismissal, swipe dismissal, and a short automatic duration.
- **Content:** State the outcome in one short sentence. Add a description or
  action only when it helps recovery; do not repeat the entire form or page
  message in the toast.
- **Accessibility:** Preserve the Sonner live-region behavior, an accessible
  close label, visible keyboard focus, and reduced-motion behavior. Keep field
  validation, persistent recovery instructions, destructive confirmations,
  empty states, and content users must read in the page flow.


/**
 * Shared visual contracts for admin surfaces.
 *
 * Keep these roles semantic so admin workflows stay on the same visual
 * language as the student and Kapten workspaces instead of accumulating
 * one-off hex values and radius variants.
 */
const ADMIN_CARD_CLASS_NAME =
	"rounded-card border border-primary-100 bg-white shadow-[0_20px_52px_-42px_color-mix(in_oklab,var(--voyage-deep)_42%,transparent)]";

const ADMIN_INSET_CLASS_NAME =
	"rounded-card border border-primary-100 bg-primary-50/70";

const ADMIN_STATUS_CLASS_NAMES = {
  danger: "border-student-status-danger-border bg-student-status-danger-bg text-student-status-danger-fg",
  info: "border-student-status-info-border bg-student-status-info-bg text-student-status-info-fg",
  neutral: "border-student-status-neutral-border bg-student-status-neutral-bg text-student-status-neutral-fg",
  success: "border-student-status-success-border bg-student-status-success-bg text-student-status-success-fg",
  warning: "border-student-status-attention-border bg-student-status-attention-bg text-student-status-attention-fg",
} as const;

const ADMIN_STATUS_FILL_CLASS_NAMES = {
  danger: "bg-student-status-danger-solid-bg text-student-status-danger-solid-fg",
  info: "bg-student-status-info-bg text-student-status-info-fg",
  neutral: "bg-secondary-100 text-secondary-700",
  success: "bg-student-status-success-solid-bg text-student-status-success-solid-fg",
  warning: "bg-student-status-attention-solid-bg text-student-status-attention-solid-fg",
} as const;

export {
  ADMIN_CARD_CLASS_NAME,
  ADMIN_INSET_CLASS_NAME,
  ADMIN_STATUS_CLASS_NAMES,
  ADMIN_STATUS_FILL_CLASS_NAMES,
};

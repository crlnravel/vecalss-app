import { cva } from "class-variance-authority";

const studentBadgeVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border font-semibold leading-none whitespace-nowrap transition-colors",
  {
    variants: {
      tone: {
        category:
          "border-student-status-category-border bg-student-status-category-bg text-student-status-category-fg",
        neutral:
          "border-student-status-neutral-border bg-student-status-neutral-bg text-student-status-neutral-fg",
        active:
          "border-student-status-active-border bg-student-status-active-bg text-student-status-active-fg",
        attention:
          "border-student-status-attention-border bg-student-status-attention-bg text-student-status-attention-fg",
        success:
          "border-student-status-success-border bg-student-status-success-bg text-student-status-success-fg",
        info: "border-student-status-info-border bg-student-status-info-bg text-student-status-info-fg",
        danger:
          "border-student-status-danger-border bg-student-status-danger-bg text-student-status-danger-fg",
      },
      size: {
        xs: "min-h-4 px-1 py-0.5 text-ui-xs",
        sm: "min-h-6 px-2.5 py-1 text-xs",
        md: "min-h-8 px-3 py-1.5 text-sm",
      },
    },
    defaultVariants: {
      size: "sm",
      tone: "neutral",
    },
  },
);

export { studentBadgeVariants };

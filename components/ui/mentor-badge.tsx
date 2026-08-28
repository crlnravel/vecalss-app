import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { studentBadgeVariants } from "./student-badge-variants";

const MENTOR_BADGE_SIZE_CLASS_NAMES = {
  compact: "min-h-0 px-2 py-0 text-xs",
  xs: "px-2.5 py-1",
  sm: "px-3 py-1.5",
  md: "px-3.5 py-2",
} as const;

type MentorBadgeSize = keyof typeof MENTOR_BADGE_SIZE_CLASS_NAMES;

type MentorBadgeProps = React.ComponentProps<"span"> &
  Omit<VariantProps<typeof studentBadgeVariants>, "size"> & {
    size?: MentorBadgeSize;
  };

function MentorBadge({
  className,
  size = "sm",
  tone = "neutral",
  ...props
}: MentorBadgeProps) {
  const variantSize = size === "compact" ? "xs" : size;

  return (
    <span
      data-slot="mentor-badge"
      className={cn(
        studentBadgeVariants({ size: variantSize, tone }),
        "border-0 font-medium shadow-[inset_0_-2px_0_rgba(1,76,56,0.08)]",
        MENTOR_BADGE_SIZE_CLASS_NAMES[size ?? "sm"],
        className,
      )}
      {...props}
    />
  );
}

export { MentorBadge };
export type { MentorBadgeProps, MentorBadgeSize };

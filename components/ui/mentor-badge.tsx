import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { studentBadgeVariants } from "./student-badge-variants";

const MENTOR_BADGE_SIZE_CLASS_NAMES = {
  xs: "px-2.5 py-1",
  sm: "px-3 py-1.5",
  md: "px-3.5 py-2",
} as const;

type MentorBadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof studentBadgeVariants>;

function MentorBadge({
  className,
  size = "sm",
  tone = "neutral",
  ...props
}: MentorBadgeProps) {
  return (
    <span
      data-slot="mentor-badge"
      className={cn(
        studentBadgeVariants({ size, tone }),
        "border-0 font-medium shadow-[inset_0_-2px_0_rgba(1,76,56,0.08)]",
        MENTOR_BADGE_SIZE_CLASS_NAMES[size ?? "sm"],
        className,
      )}
      {...props}
    />
  );
}

export { MentorBadge };
export type { MentorBadgeProps };

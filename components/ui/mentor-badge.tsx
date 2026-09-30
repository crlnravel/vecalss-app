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
  depth,
  size = "sm",
  tone = "neutral",
  ...props
}: MentorBadgeProps) {
  const variantSize = size === "compact" ? "xs" : size;
  const depthClassName =
    depth === undefined
      ? "shadow-[inset_0_-2px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)]"
      : undefined;

  return (
    <span
      data-slot="mentor-badge"
      className={cn(
        studentBadgeVariants({ depth, size: variantSize, tone }),
        "border-0 font-medium",
        depthClassName,
        MENTOR_BADGE_SIZE_CLASS_NAMES[size ?? "sm"],
        className,
      )}
      {...props}
    />
  );
}

export { MentorBadge };
export type { MentorBadgeProps, MentorBadgeSize };

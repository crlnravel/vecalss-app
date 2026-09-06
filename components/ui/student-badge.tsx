import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { studentBadgeVariants } from "./student-badge-variants";

type StudentBadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof studentBadgeVariants>;

function StudentBadge({ className, depth, size, tone, ...props }: StudentBadgeProps) {
  return (
    <span
      data-slot="student-badge"
      className={cn(
        studentBadgeVariants({ depth, size, tone }),
        className,
      )}
      {...props}
    />
  );
}

export { StudentBadge };
export type { StudentBadgeProps };

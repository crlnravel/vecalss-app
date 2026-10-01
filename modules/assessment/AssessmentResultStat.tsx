import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AssessmentResultStatProps = {
  className?: string;
  labelClassName?: string;
  label: ReactNode;
  value: ReactNode;
};

function AssessmentResultStat({
  className,
  labelClassName,
  label,
  value,
}: AssessmentResultStatProps) {
  return (
    <div
      className={cn(
		"rounded-card border border-primary-100 bg-secondary-50 px-3 py-3",
        className,
      )}
      data-slot="assessment-result-stat"
    >
      <p className={cn("text-xs font-medium text-secondary-500", labelClassName)}>{label}</p>
      <p className="mt-1 text-xl font-semibold text-secondary-900">{value}</p>
    </div>
  );
}

export { AssessmentResultStat };
export type { AssessmentResultStatProps };

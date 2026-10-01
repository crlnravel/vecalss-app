import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AssessmentNavigationFooterProps = {
  children: ReactNode;
  className?: string;
};

function AssessmentNavigationFooter({
  children,
  className,
}: AssessmentNavigationFooterProps) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-5 z-20 px-4 md:bottom-7 md:px-8",
        className,
      )}
      data-slot="assessment-navigation-footer"
    >
      <div className="pointer-events-auto mx-auto grid w-full max-w-[540px] grid-cols-[1fr_6rem_1fr] items-center gap-2 rounded-panel border border-primary-100 bg-white p-2 shadow-[0_18px_42px_-28px_color-mix(in_oklab,var(--voyage-deep)_65%,transparent)]">
        {children}
      </div>
    </div>
  );
}

export { AssessmentNavigationFooter };
export type { AssessmentNavigationFooterProps };

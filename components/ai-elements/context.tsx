import * as React from "react";

import { formatUsagePercent } from "@/lib/vera/usage-display";
import { cn } from "@/lib/utils";

/** Today's credit meter, as a sunken pill. It shows the share of the day's limit that is used, not a context window. */
function Context({
  used,
  limit,
  className,
  ...props
}: React.ComponentProps<"span"> & { used: number; limit: number }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-[44px] items-center gap-2 rounded-pill border border-primary-100/80 bg-secondary-50 px-3.5 text-xs font-medium text-voyage-deep tabular-nums shadow-[inset_-3px_-3px_8px_color-mix(in_oklab,var(--voyage-surface)_76%,transparent),inset_3px_3px_8px_color-mix(in_oklab,var(--voyage-forest)_10%,transparent)]",
        className,
      )}
      {...props}
    >
      <span className="text-muted-foreground max-sm:hidden">Kredit hari ini</span>
      {formatUsagePercent(used, limit)}
    </span>
  );
}

export { Context };

import * as React from "react";

import { formatCredits } from "@/lib/vera/credits-shared";
import { cn } from "@/lib/utils";

/** Today's credit meter. It reports spend against the day's limit, not a context window. */
function Context({
  used,
  limit,
  className,
  ...props
}: React.ComponentProps<"span"> & { used: number; limit: number }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-pill border border-border bg-card px-3 text-xs font-medium text-secondary-950 tabular-nums",
        className,
      )}
      {...props}
    >
      <span className="text-muted-foreground">Kredit hari ini</span>
      {formatCredits(used)} / {limit}
    </span>
  );
}

export { Context };

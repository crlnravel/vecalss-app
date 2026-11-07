"use client";

import { useId, useState } from "react";

import { ChevronDown } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { VeraUsageSnapshot } from "@/lib/vera/ledger";
import { formatUsagePercent } from "@/lib/vera/usage-display";
import { studentSidebarControlClassName } from "@/modules/student/components/student-sidebar";
import { VeraUsageBody } from "@/modules/vera/VeraUsageBody";

/**
 * The usage bar at the bottom of the right panel: the day's share of its limit, with a chevron. It starts collapsed and remembers nothing.
 * Opening it shows the three usage windows above the bar, inside the panel.
 */
export function VeraUsageBar({ usage }: { usage: VeraUsageSnapshot }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <div className="flex flex-col gap-2">
      {open ? (
        <div className={cn("p-3", studentSidebarControlClassName)} id={bodyId}>
          <VeraUsageBody usage={usage} />
        </div>
      ) : null}
      <button
        aria-controls={open ? bodyId : undefined}
        aria-expanded={open}
        className={cn(
          studentSidebarControlClassName,
          "flex min-h-11 w-full items-center justify-between gap-3 px-3 text-sm transition-colors duration-200 hover:bg-primary-50 focus-visible:ring-3 focus-visible:ring-primary-300/35 focus-visible:outline-none motion-reduce:transition-none",
        )}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="text-muted-foreground">Kredit hari ini</span>
        <span className="flex items-center gap-2 font-medium text-secondary-900 tabular-nums">
          {formatUsagePercent(usage.day.used, usage.day.hardLimit)}
          <ChevronDown
            aria-hidden="true"
            className={cn("size-4 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")}
          />
        </span>
      </button>
    </div>
  );
}

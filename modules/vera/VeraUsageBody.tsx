"use client";

import { useState } from "react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { VeraUsageSnapshot } from "@/lib/vera/ledger";
import { formatResetAt, formatResetIn, formatUsagePercent, usagePercent } from "@/lib/vera/usage-display";

const WINDOWS = [
  { key: "day", label: "Hari ini" },
  { key: "week", label: "Minggu ini" },
  { key: "month", label: "Bulan ini" },
] as const;

/**
 * The three usage windows, each with its share of its limit, its reset time and a bar. The header popover and the right panel both show
 * this body, so the wording is written once. The reset times count from the moment the body mounts.
 */
export function VeraUsageBody({ usage, className }: { usage: VeraUsageSnapshot; className?: string }) {
  const [now] = useState(() => new Date());
  return (
    <div className={cn("space-y-4", className)}>
      {WINDOWS.map(({ key, label }) => {
        const usageWindow = usage[key];
        const percent = usagePercent(usageWindow.used, usageWindow.hardLimit);
        const percentText = formatUsagePercent(usageWindow.used, usageWindow.hardLimit);
        const reset = key === "day" ? formatResetIn(usageWindow.resetsAt, now) : formatResetAt(usageWindow.resetsAt, now);
        const tone =
          percent >= 100
            ? "bg-student-status-danger-fg"
            : usageWindow.softWarning
              ? "bg-student-status-attention-fg"
              : "bg-voyage-leaf";
        return (
          <Progress
            aria-label={label}
            className="gap-1.5"
            getAriaValueText={() => `${percentText} terpakai`}
            indicatorClassName={tone}
            key={key}
            trackClassName="h-2 bg-voyage-sea-glass"
            value={percent}
          >
            <div className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-sm font-medium text-secondary-950">{label}</span>
              <span className="text-xs text-muted-foreground tabular-nums" suppressHydrationWarning>
                {percentText} terpakai · {reset}
              </span>
            </div>
          </Progress>
        );
      })}
    </div>
  );
}

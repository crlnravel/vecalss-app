"use client";

import { useState } from "react";

import { Context } from "@/components/ai-elements/context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import type { VeraUsageSnapshot } from "@/lib/vera/ledger";
import { formatResetAt, formatResetIn, formatUsagePercent, usagePercent } from "@/lib/vera/usage-display";

const WINDOWS = [
  { key: "day", label: "Hari ini" },
  { key: "week", label: "Minggu ini" },
  { key: "month", label: "Bulan ini" },
] as const;

/**
 * Header meter. The pill shows today's share of its limit. Opening it shows each window as a bar with its share and its reset time.
 * A bar takes the attention tone at the soft limit and the danger tone at the full limit.
 */
export function VeraUsagePopover({ usage, onOpen }: { usage: VeraUsageSnapshot; onOpen?: () => void }) {
  // The reset times are worded from the moment the meter opens, so they match the numbers beside them.
  const [openedAt, setOpenedAt] = useState(() => new Date());
  const dayPercent = formatUsagePercent(usage.day.used, usage.day.hardLimit);
  // A screen reader says "kurang dari 1" where the pill shows "<1%".
  const daySpoken = dayPercent === "<1%" ? "kurang dari 1" : dayPercent.slice(0, -1);

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) return;
        setOpenedAt(new Date());
        onOpen?.();
      }}
    >
      <PopoverTrigger aria-label={`Pemakaian hari ini ${daySpoken} persen. Buka rincian`} className="rounded-pill">
        <Context used={usage.day.used} limit={usage.day.hardLimit} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4 p-4">
        {WINDOWS.map(({ key, label }) => {
          const usageWindow = usage[key];
          const percent = usagePercent(usageWindow.used, usageWindow.hardLimit);
          const percentText = formatUsagePercent(usageWindow.used, usageWindow.hardLimit);
          const reset =
            key === "day" ? formatResetIn(usageWindow.resetsAt, openedAt) : formatResetAt(usageWindow.resetsAt, openedAt);
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
                <span className="text-xs text-muted-foreground tabular-nums">
                  {percentText} terpakai · {reset}
                </span>
              </div>
            </Progress>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

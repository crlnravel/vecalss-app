"use client";

import { Context } from "@/components/ai-elements/context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { VeraUsageSnapshot } from "@/lib/vera/ledger";
import { formatUsagePercent } from "@/lib/vera/usage-display";
import { VeraUsageBody } from "@/modules/vera/VeraUsageBody";

/**
 * The header meter. The pill shows today's share of its limit. Opening it refreshes the numbers and shows the same body the right panel
 * shows, so the two never disagree.
 */
export function VeraUsagePopover({
  usage,
  onOpen,
  className,
}: {
  usage: VeraUsageSnapshot;
  onOpen?: () => void;
  className?: string;
}) {
  const dayPercent = formatUsagePercent(usage.day.used, usage.day.hardLimit);
  // A screen reader says "kurang dari 1" where the pill shows "<1%".
  const daySpoken = dayPercent === "<1%" ? "kurang dari 1" : dayPercent.slice(0, -1);

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) onOpen?.();
      }}
    >
      <PopoverTrigger
        aria-label={`Pemakaian hari ini ${daySpoken} persen. Buka rincian`}
        className={cn("rounded-pill", className)}
      >
        <Context used={usage.day.used} limit={usage.day.hardLimit} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4">
        <VeraUsageBody usage={usage} />
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { Clock, RefreshCw } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AiRefreshBarProps = {
  lastRefreshedAt?: Date | null;
  isLoading?: boolean;
  onRefresh: () => void;
  className?: string;
};

const REFRESH_TIME_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Asia/Jakarta",
});

function formatRefreshTime(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return "Belum diperbarui";
  return `${REFRESH_TIME_FORMATTER.format(date)} WIB`;
}

export function AiRefreshBar({
  lastRefreshedAt,
  isLoading = false,
  onRefresh,
  className,
}: AiRefreshBarProps) {
  const formattedTime = formatRefreshTime(lastRefreshedAt);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 text-xs text-secondary-500",
        className,
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        <Clock className="size-3.5 text-secondary-400" />
        <span>Terakhir diperbarui:</span>
        <span aria-live="polite" className="font-semibold text-secondary-800">{formattedTime}</span>
      </div>

      <Button
        disabled={isLoading}
        onClick={onRefresh}
        type="button"
        variant="reference"
        size="sm"
        className="h-8 gap-1.5 rounded-xl px-3 text-xs font-semibold"
      >
        <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
        <span>Segarkan</span>
      </Button>
    </div>
  );
}

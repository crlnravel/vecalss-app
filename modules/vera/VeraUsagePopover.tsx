import { Context } from "@/components/ai-elements/context";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { VERA_TIME_ZONE } from "@/lib/vera/config";
import { formatCredits } from "@/lib/vera/credits-shared";
import type { VeraUsageSnapshot } from "@/lib/vera/ledger";

const WINDOWS = [
  { key: "day", label: "Hari ini" },
  { key: "week", label: "Minggu ini" },
  { key: "month", label: "Bulan ini" },
] as const;

function formatReset(value: string) {
  const formatted = new Intl.DateTimeFormat("id-ID", {
    timeZone: VERA_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
  return `${formatted} WIB`;
}

/** Top-bar meter. Opening it shows each window with its reset time. */
export function VeraUsagePopover({ usage, onOpen }: { usage: VeraUsageSnapshot; onOpen?: () => void }) {
  return (
    <Popover
      onOpenChange={(open) => {
        if (open) onOpen?.();
      }}
    >
      <PopoverTrigger className="rounded-pill">
        <Context used={usage.day.used} limit={usage.day.hardLimit} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4 p-4">
        {WINDOWS.map(({ key, label }) => {
          const window = usage[key];
          const percent = Math.min(100, (window.used / window.hardLimit) * 100);
          return (
            <div className="space-y-1.5" key={key}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-secondary-950">{label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatCredits(window.used)} / {window.hardLimit}
                </span>
              </div>
              <Progress value={percent}>
                <ProgressTrack>
                  <ProgressIndicator />
                </ProgressTrack>
              </Progress>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Reset {formatReset(window.resetsAt)}</span>
                {window.softWarning ? <Badge>Hampir habis</Badge> : null}
              </div>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">
          Biaya tiap jawaban tergantung mode berpikir dan panjang percakapan.
        </p>
      </PopoverContent>
    </Popover>
  );
}

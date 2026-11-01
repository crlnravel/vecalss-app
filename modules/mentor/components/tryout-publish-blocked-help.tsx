"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "@/lib/icons";

/** Explains a disabled "Rilis hasil" on demand, so the page carries no permanent explanatory text. */
export function TryoutPublishBlockedHelp({ reason }: { reason: string }) {
  return (
    <Popover>
      <PopoverTrigger render={<Button aria-label="Mengapa Rilis hasil belum tersedia?" className="shrink-0" size="icon" type="button" variant="outline" />}>
        <Info aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="gap-0 leading-6">
        <p role="status">{reason}</p>
      </PopoverContent>
    </Popover>
  );
}

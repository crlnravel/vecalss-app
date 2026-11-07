"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BookOpen, ClipboardList, ListChecks, Sparkles, type AppIcon } from "@/lib/icons";
import type { VeraSource } from "@/lib/vera/sources/types";

const TYPE_LABELS: Record<VeraSource["type"], string> = { materi: "Materi", kuis: "Kuis", tryout: "Tryout", studio: "Studio" };
const TYPE_ICONS: Record<VeraSource["type"], AppIcon> = {
  materi: BookOpen,
  kuis: ListChecks,
  tryout: ClipboardList,
  studio: Sparkles,
};
const ICON_STACK_LIMIT = 3;

/**
 * The sources an answer drew on, as one quiet pill for its action row: up to three type icons and the count, "N sumber". The pill opens
 * the whole list in a popover, and each entry is a link to the page it names. With no sources it renders nothing.
 */
function Sources({ sources }: { sources: VeraSource[] }) {
  if (sources.length === 0) return null;
  const types = [...new Set(sources.map((source) => source.type))].slice(0, ICON_STACK_LIMIT);
  return (
    <Popover>
      <PopoverTrigger render={<Button size="sm" type="button" variant="quiet" />}>
        <span aria-hidden="true" className="flex -space-x-1.5">
          {types.map((type) => {
            const Icon = TYPE_ICONS[type];
            return (
              <span
                className="flex size-5 items-center justify-center rounded-pill border border-border bg-white text-voyage-deep [&>svg]:size-3"
                key={type}
              >
                <Icon />
              </span>
            );
          })}
        </span>
        {sources.length} sumber
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex max-h-80 w-[min(22rem,calc(100vw-2rem))] flex-col gap-1 overflow-y-auto p-2"
        positionMethod="fixed"
        side="top"
      >
        {sources.map((source) => (
          <Link
            className="flex min-w-0 flex-col gap-0.5 rounded-control px-3 py-2 hover:bg-accent/60"
            href={source.href}
            key={`${source.type}:${source.id}`}
          >
            <span className="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
              {TYPE_LABELS[source.type]}
            </span>
            <span className="truncate text-sm font-medium text-foreground">{source.label}</span>
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export { Sources };

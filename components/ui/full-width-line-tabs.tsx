"use client"

import type { ComponentProps } from "react"

import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type FullWidthLineTabsListProps = Omit<
  ComponentProps<typeof TabsList>,
  "variant"
>

type FullWidthLineTabsTriggerProps = ComponentProps<typeof TabsTrigger>

/**
 * The shared full-width line treatment (DESIGN.md Variant 2).
 *
 * It intentionally wraps the existing line primitive instead of changing its
 * defaults because the line primitive is also used by compact dialog tabs.
 */
function FullWidthLineTabsList({
  className,
  ...props
}: FullWidthLineTabsListProps) {
  return (
    <TabsList
      className={cn(
        "!flex !h-11 !w-full !items-stretch !gap-0 !rounded-none !bg-transparent !p-0",
        className,
      )}
      variant="line"
      {...props}
    />
  )
}

function FullWidthLineTabsTrigger({
  className,
  ...props
}: FullWidthLineTabsTriggerProps) {
  return (
    <TabsTrigger
      className={cn(
        "!h-11 min-w-0 rounded-none px-3 py-2 text-xs font-medium text-voyage-muted-ink hover:text-voyage-ink sm:text-sm",
        "data-active:bg-voyage-sea-glass-wash data-active:text-voyage-deep data-active:shadow-[inset_-3px_-3px_8px_rgba(255,255,255,0.76),inset_3px_3px_8px_rgba(23,107,77,0.1)] after:bg-voyage-deep",
        "focus-visible:border-voyage-leaf focus-visible:ring-voyage-leaf/45 focus-visible:outline-voyage-leaf",
        "motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  )
}

export {
  FullWidthLineTabsList,
  FullWidthLineTabsTrigger,
}

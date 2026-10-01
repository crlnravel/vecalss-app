"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

type TabsLayout = "content" | "equal"
type TabsListProps = TabsPrimitive.List.Props & { layout?: TabsLayout }
type TabsTriggerProps = TabsPrimitive.Tab.Props & { layout?: TabsLayout }
type TabsTriggerClassName = TabsTriggerProps["className"]
type TabsTriggerClassState = Parameters<
  Extract<NonNullable<TabsTriggerClassName>, (...args: never[]) => unknown>
>[0]

const TAB_LIST_LAYOUTS: Record<TabsLayout, string> = {
  content:
    "inline-flex h-[44px] w-fit max-w-full items-center justify-start gap-2 overflow-x-auto rounded-none bg-transparent p-0 group-data-vertical/tabs:h-fit group-data-vertical/tabs:w-full group-data-vertical/tabs:flex-col group-data-vertical/tabs:items-stretch [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
  equal:
    "flex h-[44px] w-full items-stretch gap-2 rounded-none bg-transparent p-0 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
}

const TAB_TRIGGER_LAYOUTS: Record<TabsLayout, string> = {
  content: "w-fit min-w-[44px] flex-none whitespace-nowrap px-4",
  equal: "min-w-0 flex-1 px-3",
}

const TAB_TRIGGER_BASE_CLASS_NAME =
  "relative inline-flex h-[44px] min-h-[44px] items-center justify-center gap-2 rounded-control border border-voyage-soft-border bg-voyage-surface py-2 text-sm font-medium text-voyage-muted-ink transition-[background-color,border-color,color,box-shadow] hover:border-voyage-leaf/45 hover:text-voyage-ink focus-visible:border-voyage-leaf focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-voyage-leaf/45 data-active:border-voyage-deep data-active:hover:border-voyage-deep data-active:focus-visible:border-voyage-deep data-active:bg-voyage-sea-glass-wash data-active:text-voyage-deep data-active:shadow-[inset_-3px_-3px_8px_color-mix(in_oklab,var(--voyage-surface)_76%,transparent),inset_3px_3px_8px_color-mix(in_oklab,var(--voyage-forest)_10%,transparent)] after:hidden disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 motion-reduce:transition-none group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start"

function mergeTabsClassName<State>(
  baseClassName: string,
  className: string | ((state: State) => string | undefined) | undefined,
) {
  if (typeof className === "function") {
    return (state: State) => cn(baseClassName, className(state))
  }

  return cn(baseClassName, className)
}

function sunkenTabsTriggerClassName(layout: TabsLayout, className?: string) {
  return cn(TAB_TRIGGER_BASE_CLASS_NAME, TAB_TRIGGER_LAYOUTS[layout], className)
}

function tabsTriggerClassName(
  layout: TabsLayout,
  className: TabsTriggerClassName,
): TabsTriggerClassName {
  if (typeof className === "function") {
    return (state: TabsTriggerClassState) =>
      sunkenTabsTriggerClassName(layout, className(state))
  }

  return sunkenTabsTriggerClassName(layout, className)
}

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={mergeTabsClassName<TabsPrimitive.Root.State>(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className,
      )}
      orientation={orientation}
      {...props}
    />
  )
}

function TabsList({
  className,
  layout = "content",
  ...props
}: TabsListProps) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-layout={layout}
      className={mergeTabsClassName<TabsPrimitive.List.State>(
        cn("group/tabs-list", TAB_LIST_LAYOUTS[layout]),
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  layout = "content",
  ...props
}: TabsTriggerProps) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      data-layout={layout}
      className={tabsTriggerClassName(layout, className)}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={mergeTabsClassName<TabsPrimitive.Panel.State>(
        "flex-1 text-ui-sm outline-none",
        className,
      )}
      {...props}
    />
  )
}

export type { TabsLayout, TabsListProps, TabsTriggerProps }
export { Tabs, TabsList, TabsTrigger, TabsContent, sunkenTabsTriggerClassName }

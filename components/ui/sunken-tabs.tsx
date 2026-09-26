"use client"

import Link from "next/link"
import type { ComponentProps } from "react"

import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type SunkenTabsLayout = "content" | "equal"

type SunkenTabsListProps = Omit<
  ComponentProps<typeof TabsList>,
  "variant"
> & {
  layout?: SunkenTabsLayout
}

type SunkenTabsTriggerProps = ComponentProps<typeof TabsTrigger> & {
  layout?: SunkenTabsLayout
}

type SunkenTabsTriggerClassName = SunkenTabsTriggerProps["className"]
type SunkenTabsTriggerClassState = Parameters<
  Extract<NonNullable<SunkenTabsTriggerClassName>, (...args: never[]) => unknown>
>[0]

type SunkenTabButtonProps = ComponentProps<"button"> & {
  layout?: SunkenTabsLayout
  selected: boolean
}

type SunkenTabLinkProps = ComponentProps<typeof Link> & {
  layout?: SunkenTabsLayout
  selected: boolean
}

type SunkenTabNavigationProps = ComponentProps<"nav">

const SUNKEN_TAB_LIST_LAYOUTS: Record<SunkenTabsLayout, string> = {
  content:
    "!flex !h-11 !w-fit !max-w-full !justify-start !gap-2 !overflow-x-auto !rounded-none !bg-transparent !p-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
  equal:
    "!flex !h-11 !w-full !items-stretch !gap-2 !rounded-none !bg-transparent !p-0",
}

const SUNKEN_TAB_TRIGGER_LAYOUTS: Record<SunkenTabsLayout, string> = {
  content: "!w-fit !min-w-[44px] !flex-none !whitespace-nowrap px-4",
  equal: "!min-w-0 !flex-1 px-3",
}

const SUNKEN_TAB_TRIGGER_CLASS_NAME =
  "inline-flex !h-11 !min-h-11 items-center justify-center gap-2 !rounded-[12px] !border !border-voyage-soft-border bg-voyage-surface py-2 text-sm font-medium text-voyage-muted-ink transition-[background-color,border-color,color,box-shadow] hover:!border-voyage-leaf/45 hover:text-voyage-ink focus-visible:!border-voyage-leaf focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-voyage-leaf/45 data-active:!border-voyage-deep data-active:hover:!border-voyage-deep data-active:focus-visible:!border-voyage-deep data-active:!bg-voyage-sea-glass-wash data-active:!text-voyage-deep data-active:shadow-[inset_-3px_-3px_8px_color-mix(in_oklab,var(--voyage-surface)_76%,transparent),inset_3px_3px_8px_color-mix(in_oklab,var(--voyage-forest)_10%,transparent)] after:!hidden motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50"

function sunkenTabTriggerClassName(
  layout: SunkenTabsLayout,
  className?: string,
) {
  return cn(
    SUNKEN_TAB_TRIGGER_CLASS_NAME,
    SUNKEN_TAB_TRIGGER_LAYOUTS[layout],
    className,
  )
}

function sunkenTabsTriggerClassName(
  layout: SunkenTabsLayout,
  className: SunkenTabsTriggerClassName,
): SunkenTabsTriggerClassName {
  if (typeof className === "function") {
    return (state: SunkenTabsTriggerClassState) =>
      sunkenTabTriggerClassName(layout, className(state))
  }

  return sunkenTabTriggerClassName(layout, className)
}

function SunkenTabsList({
  className,
  layout = "content",
  ...props
}: SunkenTabsListProps) {
  return (
    <TabsList
      className={cn(SUNKEN_TAB_LIST_LAYOUTS[layout], className)}
      variant={layout === "equal" ? "line" : "default"}
      {...props}
    />
  )
}

function SunkenTabsTrigger({
  className,
  layout = "content",
  ...props
}: SunkenTabsTriggerProps) {
  return (
    <TabsTrigger
      className={sunkenTabsTriggerClassName(layout, className)}
      {...props}
    />
  )
}

function SunkenTabButton({
  className,
  layout = "content",
  selected,
  ...props
}: SunkenTabButtonProps) {
  return (
    <button
      className={sunkenTabTriggerClassName(layout, className)}
      {...props}
      data-active={selected ? "" : undefined}
    />
  )
}

function SunkenTabLink({
  className,
  layout = "content",
  selected,
  ...props
}: SunkenTabLinkProps) {
  return (
    <Link
      className={sunkenTabTriggerClassName(layout, className)}
      {...props}
      data-active={selected ? "" : undefined}
    />
  )
}

function SunkenTabNavigation({ className, ...props }: SunkenTabNavigationProps) {
  return (
    <nav
      className={cn("flex w-full items-stretch gap-2", className)}
      {...props}
    />
  )
}

export type {
  SunkenTabButtonProps,
  SunkenTabLinkProps,
  SunkenTabNavigationProps,
  SunkenTabsLayout,
  SunkenTabsListProps,
  SunkenTabsTriggerProps,
}
export {
  SunkenTabButton,
  SunkenTabLink,
  SunkenTabNavigation,
  SunkenTabsList,
  SunkenTabsTrigger,
}

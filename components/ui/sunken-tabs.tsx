"use client"

import Link from "next/link"
import type { ComponentProps } from "react"

import {
  TabsList,
  TabsTrigger,
  sunkenTabsTriggerClassName,
} from "@/components/ui/tabs"
import type { TabsLayout } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type SunkenTabsLayout = TabsLayout
type SunkenTabsListProps = ComponentProps<typeof TabsList>
type SunkenTabsTriggerProps = ComponentProps<typeof TabsTrigger>

type SunkenTabButtonProps = ComponentProps<"button"> & {
  layout?: SunkenTabsLayout
  selected: boolean
}

type SunkenTabLinkProps = ComponentProps<typeof Link> & {
  layout?: SunkenTabsLayout
  selected: boolean
}

type SunkenTabNavigationProps = ComponentProps<"nav">

function SunkenTabsList({
  className,
  layout = "content",
  ...props
}: SunkenTabsListProps) {
  return <TabsList className={className} layout={layout} {...props} />
}

function SunkenTabsTrigger({
  className,
  layout = "content",
  ...props
}: SunkenTabsTriggerProps) {
  return <TabsTrigger className={className} layout={layout} {...props} />
}

function SunkenTabButton({
  className,
  layout = "content",
  selected,
  ...props
}: SunkenTabButtonProps) {
  return (
    <button
      className={sunkenTabsTriggerClassName(layout, className)}
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
      className={sunkenTabsTriggerClassName(layout, className)}
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

"use client"

import type { ComponentProps } from "react"

import { TabsList, TabsTrigger } from "@/components/ui/tabs"

type FullWidthTabsListProps = Omit<ComponentProps<typeof TabsList>, "layout">
type FullWidthTabsTriggerProps = Omit<
  ComponentProps<typeof TabsTrigger>,
  "layout"
>

/** Full-width adapter for the shared sunken tab treatment. */
function FullWidthTabsList({ className, ...props }: FullWidthTabsListProps) {
  return <TabsList {...props} className={className} layout="equal" />
}

function FullWidthTabsTrigger({
  className,
  ...props
}: FullWidthTabsTriggerProps) {
  return <TabsTrigger {...props} className={className} layout="equal" />
}

export type { FullWidthTabsListProps, FullWidthTabsTriggerProps }
export { FullWidthTabsList, FullWidthTabsTrigger }

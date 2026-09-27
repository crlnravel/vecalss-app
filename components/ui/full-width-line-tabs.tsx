"use client"

import type { ComponentProps } from "react"

import type { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SunkenTabsList, SunkenTabsTrigger } from "@/components/ui/sunken-tabs"

type FullWidthLineTabsListProps = Omit<
  ComponentProps<typeof TabsList>,
  "variant"
>

type FullWidthLineTabsTriggerProps = ComponentProps<typeof TabsTrigger>

/** Full-width adapter for the shared sunken tab treatment. */
function FullWidthLineTabsList({
  className,
  ...props
}: FullWidthLineTabsListProps) {
  return (
    <SunkenTabsList
      className={className}
      layout="equal"
      {...props}
    />
  )
}

function FullWidthLineTabsTrigger({
  className,
  ...props
}: FullWidthLineTabsTriggerProps) {
  return (
    <SunkenTabsTrigger
      className={className}
      layout="equal"
      {...props}
    />
  )
}

export {
  FullWidthLineTabsList,
  FullWidthLineTabsTrigger,
}

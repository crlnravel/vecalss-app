import type { ComponentProps } from "react"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { badgeVariants } from "./badge-variants"

type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants>

function Badge({ className, size, tone, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-tone={tone ?? "neutral"}
      className={cn(badgeVariants({ size, tone }), className)}
      {...props}
    />
  )
}

export { Badge }
export type { BadgeProps }

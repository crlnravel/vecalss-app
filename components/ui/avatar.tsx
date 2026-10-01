"use client"

import * as React from "react"
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"

import { cn } from "@/lib/utils"

function avatarClassName<State>(
  baseClassName: string,
  className: string | ((state: State) => string | undefined) | undefined,
) {
  if (typeof className === "function") {
    return (state: State) => cn(baseClassName, className(state))
  }

  return cn(baseClassName, className)
}

function Avatar({
  className,
  size = "default",
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: "default" | "sm" | "lg"
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={avatarClassName<AvatarPrimitive.Root.State>(
        "group/avatar relative flex size-[32px] shrink-0 rounded-pill select-none after:absolute after:inset-0 after:rounded-pill after:border after:border-voyage-sea-glass/40 after:mix-blend-darken data-[size=lg]:size-[40px] data-[size=sm]:size-[24px] dark:after:border-voyage-sea-glass/30 dark:after:mix-blend-lighten",
        className,
      )}
      {...props}
    />
  )
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={avatarClassName<AvatarPrimitive.Image.State>(
        "aspect-square size-full rounded-pill object-cover",
        className,
      )}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={avatarClassName<AvatarPrimitive.Fallback.State>(
        "flex size-full items-center justify-center rounded-pill bg-voyage-sea-glass-wash text-xs font-semibold leading-none tracking-[0.02em] text-voyage-deep uppercase",
        className,
      )}
      {...props}
    />
  )
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-pill bg-voyage-deep text-voyage-surface bg-blend-color ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-[8px] group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-[10px] group-data-[size=default]/avatar:[&>svg]:size-[8px]",
        "group-data-[size=lg]/avatar:size-[12px] group-data-[size=lg]/avatar:[&>svg]:size-[8px]",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-[8px] *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-[32px] shrink-0 items-center justify-center rounded-pill bg-voyage-sea-glass-wash text-xs font-semibold leading-none tracking-[0.02em] text-voyage-deep ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-[40px] group-has-data-[size=sm]/avatar-group:size-[24px] [&>svg]:size-[16px] group-has-data-[size=lg]/avatar-group:[&>svg]:size-[20px] group-has-data-[size=sm]/avatar-group:[&>svg]:size-[12px]",
        className
      )}
      {...props}
    />
  )
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
}

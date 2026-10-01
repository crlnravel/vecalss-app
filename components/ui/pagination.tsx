"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "@/lib/icons";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PaginationSize = "sm" | "default";

const PaginationSizeContext = React.createContext<PaginationSize>("default");

type PaginationButtonProps = Omit<React.ComponentProps<typeof Button>, "size"> & {
  size?: PaginationSize;
};

function Pagination({ className, size = "default", ...props }: React.ComponentProps<"nav"> & { size?: PaginationSize }) {
  return (
    <PaginationSizeContext.Provider value={size}>
      <nav
        aria-label="pagination"
        data-slot="pagination"
        data-size={size}
        className={cn("mx-auto flex w-full justify-center", className)}
        {...props}
      />
    </PaginationSizeContext.Provider>
  );
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex items-center gap-1", className)}
      {...props}
    />
  );
}

function PaginationItem(props: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />;
}

function PaginationPrevious({
  className,
  text = "Sebelumnya",
  minimal = false,
  size,
  ...props
}: PaginationButtonProps & { text?: string; minimal?: boolean }) {
  const inheritedSize = React.useContext(PaginationSizeContext);
  const isSmall = (size ?? inheritedSize) === "sm";
  return (
    <Button
      aria-label="Ke halaman sebelumnya"
      className={cn(isSmall ? "text-[12px]" : "text-[14px]", className)}
      size={minimal ? (isSmall ? "icon-sm" : "icon") : isSmall ? "xs" : "default"}
      type="button"
      variant={minimal ? "quiet" : "outline"}
      {...props}
    >
      <ChevronLeft data-icon="inline-start" />
      {!minimal && <span className="hidden sm:block">{text}</span>}
    </Button>
  );
}

function PaginationNext({
  className,
  text = "Berikutnya",
  minimal = false,
  size,
  ...props
}: PaginationButtonProps & { text?: string; minimal?: boolean }) {
  const inheritedSize = React.useContext(PaginationSizeContext);
  const isSmall = (size ?? inheritedSize) === "sm";
  return (
    <Button
      aria-label="Ke halaman berikutnya"
      className={cn(isSmall ? "text-[12px]" : "text-[14px]", className)}
      size={minimal ? (isSmall ? "icon-sm" : "icon") : isSmall ? "xs" : "default"}
      type="button"
      variant={minimal ? "quiet" : "outline"}
      {...props}
    >
      {!minimal && <span className="hidden sm:block">{text}</span>}
      <ChevronRight data-icon="inline-end" />
    </Button>
  );
}

function PaginationPage({
  className,
  isActive = false,
  minimal = false,
  size,
  ...props
}: PaginationButtonProps & {
  isActive?: boolean;
  minimal?: boolean;
}) {
  const inheritedSize = React.useContext(PaginationSizeContext);
  const isSmall = (size ?? inheritedSize) === "sm";
  return (
    <Button
      size={isSmall ? "icon-sm" : "icon"}
      type="button"
      variant={minimal ? "quiet" : isActive ? "default" : "outline"}
      className={cn(
        isSmall ? "text-[12px]" : "text-[14px]",
        minimal && isActive && "bg-primary-50 font-semibold text-primary-800 shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)] ring-1 ring-inset ring-primary-100",
        className,
      )}
      {...props}
      aria-current={isActive ? "page" : undefined}
    />
  );
}

function PaginationEllipsis({
  className,
  size,
  ...props
}: React.ComponentProps<"span"> & { size?: PaginationSize }) {
  const inheritedSize = React.useContext(PaginationSizeContext);
  const isSmall = (size ?? inheritedSize) === "sm";
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn("flex items-center justify-center", isSmall ? "size-[40px]" : "size-[44px]", className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">Halaman lainnya</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPage,
  PaginationPrevious,
};

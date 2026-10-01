import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "@/lib/icons";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
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
  ...props
}: React.ComponentProps<typeof Button> & { text?: string }) {
  return (
    <Button
      aria-label="Ke halaman sebelumnya"
      className={cn(className)}
      size="sm"
      variant="outline"
      {...props}
    >
      <ChevronLeft data-icon="inline-start" />
      <span className="hidden sm:block">{text}</span>
    </Button>
  );
}

function PaginationNext({
  className,
  text = "Berikutnya",
  ...props
}: React.ComponentProps<typeof Button> & { text?: string }) {
  return (
    <Button
      aria-label="Ke halaman berikutnya"
      className={cn(className)}
      size="sm"
      variant="outline"
      {...props}
    >
      <span className="hidden sm:block">{text}</span>
      <ChevronRight data-icon="inline-end" />
    </Button>
  );
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn("flex size-9 items-center justify-center", className)}
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
  PaginationPrevious,
};

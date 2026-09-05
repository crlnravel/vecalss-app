"use client";

import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from "@/lib/icons";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ReferenceSelect } from "@/components/dashboard/reference-dashboard-controls";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  contentTypeMeta,
  statusLabels,
} from "@/modules/mentor/resource-types";
import { quickCreateItems } from "@/modules/mentor/quick-create-items";
import type { KaptenContentStatus, KaptenResource } from "@/modules/mentor/resource-types";

const statusClasses: Record<KaptenContentStatus, string> = {
  archived: "border-secondary-200 bg-secondary-50 text-secondary-600",
  draft: "border-[var(--warning-200)] bg-[var(--warning-50)] text-[var(--voyage-warm-sun-ink)]",
  published: "border-primary-200 bg-primary-50 text-primary-800",
  scheduled: "border-secondary-200 bg-secondary-50 text-secondary-700",
};

const availabilityFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeZone: "Asia/Jakarta",
  timeStyle: "short",
});

function StatusPill({ status }: { status: KaptenContentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        statusClasses[status],
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

function formatAvailability(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return availabilityFormatter.format(date);
}

function PageIntro({
  action,
  description,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <section className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? (
          <p className="kicker-label text-secondary-500">{eyebrow}</p>
        ) : null}
        <h1
          className={cn(
            "break-words text-4xl leading-tight font-semibold text-secondary-900 md:text-5xl",
            eyebrow ? "mt-2" : "",
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-[48ch] text-sm leading-6 text-secondary-500 md:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </section>
  );
}

function SectionHeading({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-2xl leading-tight font-semibold text-secondary-900">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-[42ch] text-sm leading-6 text-secondary-500">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

function ResourceRow({
  compact = false,
  emphasis = false,
  resource,
}: {
  compact?: boolean;
  emphasis?: boolean;
  resource: KaptenResource;
}) {
  const meta = contentTypeMeta[resource.resourceType];
  const subtitle = resource.resourceType === "tryout"
    ? "Tryout"
    : resource.resourceType === "materi"
      ? `${resource.subjectCode ?? ""}${resource.subjectCode ? " · " : ""}Materi`
      : resource.resourceType === "quiz"
        ? `${resource.subjectCode ?? ""}${resource.subjectCode ? " · " : ""}Kuis`
        : `${resource.subjectCode ?? ""}${resource.subjectCode ? " · " : ""}${meta.label}`;

  return (
    <Link
      href={resource.href}
      className={cn(
        "group flex flex-col border transition-[transform,border-color,background-color,box-shadow] duration-200 motion-reduce:transform-none motion-reduce:transition-none md:flex-row md:items-center motion-safe:hover:-translate-y-0.5 motion-safe:focus-within:-translate-y-0.5",
        compact
          ? "gap-3 rounded-2xl px-4 py-3 md:gap-3"
          : "gap-4 rounded-3xl px-4 py-4",
        emphasis
          ? "border-[var(--warning-200)] bg-[var(--warning-50)] hover:border-[var(--warning-300)] hover:bg-[var(--warning-50)] hover:shadow-[0_18px_38px_-28px_color-mix(in_oklab,var(--warning-700)_42%,transparent)] focus-within:border-[var(--warning-300)] focus-within:shadow-[0_18px_38px_-28px_color-mix(in_oklab,var(--warning-700)_42%,transparent)]"
          : "border-primary-100 bg-white hover:border-primary-200 hover:bg-primary-50/40 hover:shadow-[0_18px_38px_-28px_color-mix(in_oklab,var(--voyage-deep)_38%,transparent)] focus-within:border-primary-200 focus-within:shadow-[0_18px_38px_-28px_color-mix(in_oklab,var(--voyage-deep)_38%,transparent)]",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <meta.icon className="size-5 shrink-0 text-primary-800" />
          <p className="truncate text-base font-semibold leading-6 text-secondary-900">
            {resource.title}
          </p>
          <StatusPill status={resource.status} />
        </div>
        <p className="mt-1 line-clamp-1 text-sm leading-6 text-secondary-500">
          {subtitle}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary-500">
          <span>{resource.updatedAt}</span>
          {resource.resourceType === "quiz" && resource.opensAt ? (
            <span>Buka {formatAvailability(resource.opensAt)}</span>
          ) : null}
          {resource.resourceType === "quiz" && resource.closesAt ? (
            <span>Tutup {formatAvailability(resource.closesAt)}</span>
          ) : null}
          {resource.scheduledFor ? <span>{resource.scheduledFor}</span> : null}
        </div>
      </div>

      <div className="flex items-center justify-end md:min-w-8">
        <ArrowRight
          className={cn(
            "text-secondary-400 motion-safe:transition-transform motion-reduce:transition-none motion-safe:group-hover:translate-x-1",
            compact ? "size-3.5" : "size-4",
          )}
        />
      </div>
    </Link>
  );
}

function QuickCreateMenu({ label }: { label?: string } = {}) {
  const hasLabel = Boolean(label);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={label ?? "Buat cepat"}
            className="min-h-[44px] min-w-[44px] motion-reduce:transition-none"
            size={hasLabel ? "sm" : "icon"}
            title={label ?? "Buat cepat"}
            type="button"
            variant={hasLabel ? "brand" : "brandOutline"}
          />
        }
      >
        <Plus />
        {label ? <span>{label}</span> : null}
        {label ? <ChevronDown aria-hidden="true" className="size-4 opacity-70" /> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {quickCreateItems.map((item) => (
          <DropdownMenuItem
            key={item.label}
            render={<Link href={item.href} />}
          >
            <item.icon className="text-primary-800" />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PaginationControls({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav aria-label="Paginasi" className="flex items-center justify-center gap-2 pt-2">
      <Button
        aria-label="Halaman sebelumnya"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
        className="size-[44px] min-h-[44px] min-w-[44px] motion-reduce:transition-none"
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ChevronLeft />
      </Button>
      <span aria-current="page" className="min-w-28 text-center text-sm font-semibold text-secondary-600">
        Halaman {page} dari {pageCount}
      </span>
      <Button
        aria-label="Halaman berikutnya"
        disabled={page === pageCount}
        onClick={() => onPageChange(page + 1)}
        className="size-[44px] min-h-[44px] min-w-[44px] motion-reduce:transition-none"
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ChevronRight />
      </Button>
    </nav>
  );
}

function PaginationLinks({
  nextHref,
  page,
  pageCount,
  previousHref,
}: {
  nextHref?: string;
  page: number;
  pageCount: number;
  previousHref?: string;
}) {
  return (
    <nav aria-label="Paginasi" className="flex items-center justify-center gap-2 pt-2">
      {previousHref ? (
        <Button
          aria-label="Halaman sebelumnya"
          className="size-[44px] min-h-[44px] min-w-[44px] motion-reduce:transition-none"
          nativeButton={false}
          render={<Link href={previousHref} />}
          size="icon-sm"
          variant="ghost"
        >
          <ChevronLeft />
        </Button>
      ) : (
        <Button aria-label="Halaman sebelumnya" className="size-[44px] min-h-[44px] min-w-[44px] motion-reduce:transition-none" disabled size="icon-sm" type="button" variant="ghost">
          <ChevronLeft />
        </Button>
      )}
      <span aria-current="page" className="min-w-28 text-center text-sm font-semibold text-secondary-600">
        Halaman {page} dari {pageCount}
      </span>
      {nextHref ? (
        <Button
          aria-label="Halaman berikutnya"
          className="size-[44px] min-h-[44px] min-w-[44px] motion-reduce:transition-none"
          nativeButton={false}
          render={<Link href={nextHref} />}
          size="icon-sm"
          variant="ghost"
        >
          <ChevronRight />
        </Button>
      ) : (
        <Button aria-label="Halaman berikutnya" className="size-[44px] min-h-[44px] min-w-[44px] motion-reduce:transition-none" disabled size="icon-sm" type="button" variant="ghost">
          <ChevronRight />
        </Button>
      )}
    </nav>
  );
}

type DropdownFieldOption = { label: string; value: string };

function DropdownField({
  ariaLabel,
  className,
  disabled,
  id,
  onValueChange,
  options,
  placeholder,
  value,
}: {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  onValueChange: (value: string) => void;
  options: DropdownFieldOption[];
  placeholder: string;
  value: string;
}) {
  return (
    <ReferenceSelect
      aria-label={ariaLabel ?? placeholder}
      className={className}
      disabled={disabled}
      id={id}
      onValueChange={onValueChange}
      options={options}
      placeholder={placeholder}
      value={value}
    />
  );
}

function CatalogueSearchInput({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="relative block w-full">
      <span className="sr-only">{placeholder}</span>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-primary-700" />
      <input
        className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "h-12 px-11 text-secondary-900 motion-reduce:transition-none")}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  );
}

function SearchPanel({
  id = "kapten-content-search",
  placeholder = "Cari di halaman ini…",
}: {
  id?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <label className="sr-only" htmlFor={id}>{placeholder}</label>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-secondary-400" />
      <input
        aria-label={placeholder}
        className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "h-12 px-11 motion-reduce:transition-none")}
        id={id}
        placeholder={placeholder}
        type="search"
      />
    </div>
  );
}

function EmptyState({
  actionLabel,
  description,
  href,
  title,
}: {
  actionLabel: string;
  description: string;
  href: string;
  title: string;
}) {
  return (
    <div className="rounded-4xl border border-dashed border-primary-200 bg-white/70 px-5 py-7 text-center">
      <p className="text-lg font-semibold text-secondary-900">{title}</p>
      <p className="mx-auto mt-2 max-w-[44ch] text-sm leading-6 text-secondary-500">
        {description}
      </p>
      <Button
        className="mt-5 min-h-[44px] motion-reduce:transition-none"
        render={<Link href={href} />}
        size="default"
        variant="brand"
      >
        <Plus />
        {actionLabel}
      </Button>
    </div>
  );
}

export {
  CatalogueSearchInput,
  DropdownField,
  EmptyState,
  PageIntro,
  PaginationControls,
  PaginationLinks,
  QuickCreateMenu,
  ResourceRow,
  SearchPanel,
  SectionHeading,
  StatusPill,
};

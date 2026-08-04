"use client";

import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  contentTypeMeta,
  quickCreateItems,
  statusLabels,
  type KaptenContentStatus,
  type KaptenResource,
} from "@/modules/mentor/mock-data";

const statusClasses: Record<KaptenContentStatus, string> = {
  archived: "border-secondary-200 bg-secondary-50 text-secondary-600",
  draft: "border-[#ead9a5] bg-[#fff8df] text-[#856300]",
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
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="kicker-label text-secondary-500">{eyebrow}</p>
        ) : null}
        <h1
          className={cn(
            "text-4xl leading-tight font-semibold text-secondary-900 md:text-5xl",
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
      <div>
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
  emphasis = false,
  resource,
}: {
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
        "group flex flex-col gap-4 rounded-3xl border px-4 py-4 transition-[transform,border-color,background-color,box-shadow] duration-200 md:flex-row md:items-center motion-safe:hover:-translate-y-0.5 motion-safe:focus-within:-translate-y-0.5",
        emphasis
          ? "border-[#ead9a5] bg-[#fffdf1] hover:border-[#e3c978] hover:bg-[#fffbed] hover:shadow-[0_18px_38px_-28px_rgba(112,88,8,0.42)] focus-within:border-[#e3c978] focus-within:shadow-[0_18px_38px_-28px_rgba(112,88,8,0.42)]"
          : "border-primary-100 bg-white hover:border-primary-200 hover:bg-primary-50/40 hover:shadow-[0_18px_38px_-28px_rgba(1,76,56,0.38)] focus-within:border-primary-200 focus-within:shadow-[0_18px_38px_-28px_rgba(1,76,56,0.38)]",
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
        <ArrowRight className="size-4 text-secondary-400 transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

function QuickCreateMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Buat cepat"
            size="icon"
            title="Buat cepat"
            variant="brandOutline"
          />
        }
      >
        <Plus />
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
        size="icon-sm"
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
        size="icon-sm"
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
          render={<Link href={previousHref} />}
          size="icon-sm"
          variant="ghost"
        >
          <ChevronLeft />
        </Button>
      ) : (
        <Button aria-label="Halaman sebelumnya" disabled size="icon-sm" variant="ghost">
          <ChevronLeft />
        </Button>
      )}
      <span aria-current="page" className="min-w-28 text-center text-sm font-semibold text-secondary-600">
        Halaman {page} dari {pageCount}
      </span>
      {nextHref ? (
        <Button
          aria-label="Halaman berikutnya"
          render={<Link href={nextHref} />}
          size="icon-sm"
          variant="ghost"
        >
          <ChevronRight />
        </Button>
      ) : (
        <Button aria-label="Halaman berikutnya" disabled size="icon-sm" variant="ghost">
          <ChevronRight />
        </Button>
      )}
    </nav>
  );
}

type CatalogueFilterOption = {
  label: string;
  value: string;
};

function CatalogueFilter({
  label,
  onValueChange,
  options,
  value,
}: {
  label: string;
  onValueChange: (value: string) => void;
  options: CatalogueFilterOption[];
  value: string;
}) {
  const selected = options.find((option) => option.value === value)?.label ?? label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        render={<Button className="h-11 min-w-40 justify-between rounded-xl border-primary-100 bg-white px-4 text-sm font-medium text-secondary-950 hover:border-primary-300 hover:bg-primary-50/40" variant="context" />}
      >
        <span className="truncate">{selected}</span>
        <ChevronDown aria-hidden className="size-4 text-secondary-600" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuRadioGroup onValueChange={onValueChange} value={value}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value || "all"} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
  const selected = options.find((option) => option.value === value)?.label ?? placeholder;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={ariaLabel ?? placeholder}
        disabled={disabled}
        id={id}
        render={<Button className={cn("h-12 w-full justify-between rounded-2xl border-secondary-900/14 bg-white px-5 text-left text-[15px] font-normal text-secondary-900 hover:border-primary-300 hover:bg-primary-50/40" , className)} variant="context" />}
      >
        <span className="truncate">{selected}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-secondary-500" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-(--anchor-width)">
        <DropdownMenuRadioGroup onValueChange={onValueChange} value={value}>
          {value === "" ? <DropdownMenuRadioItem value="" disabled>{placeholder}</DropdownMenuRadioItem> : null}
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-primary-700" />
      <input
        className="h-12 w-full rounded-2xl border border-primary-200 bg-white px-11 text-sm text-secondary-900 shadow-sm outline-none transition focus:border-primary-500 focus:ring-3 focus:ring-primary-300/35"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  );
}

function SearchPanel({
  placeholder = "Cari di halaman ini...",
}: {
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-secondary-400" />
      <input
        className="h-12 w-full rounded-2xl border border-primary-100 bg-white px-11 text-sm shadow-sm outline-none transition focus:border-primary-300 focus:ring-3 focus:ring-primary-300/20"
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
        className="mt-5"
        render={<Link href={href} />}
        size="sm"
        variant="brand"
      >
        <Plus />
        {actionLabel}
      </Button>
    </div>
  );
}

export {
  CatalogueFilter,
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

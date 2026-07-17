"use client";

import Link from "next/link";
import {
  ArrowRight,
  Plus,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  contentTypeMeta,
  quickCreateItems,
  statusLabels,
  type KaptenContentStatus,
  type KaptenResource,
} from "@/modules/mentor/mock-data";

type MateriResource = KaptenResource & {
  duration: string;
  readiness: "ready" | "incomplete";
};

const statusClasses: Record<KaptenContentStatus, string> = {
  archived: "text-secondary-500",
  draft: "text-[#856300]",
  published: "text-primary-800",
  scheduled: "text-secondary-700",
};

function StatusPill({ status }: { status: KaptenContentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-sm font-semibold",
        statusClasses[status],
      )}
    >
      {statusLabels[status]}
    </span>
  );
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
  const isMateri = resource.resourceType === "materi";
  const lesson = resource as MateriResource;
  const primaryMetric = isMateri
    ? `${lesson.duration || "Durasi belum diisi"} · ${lesson.readiness === "ready" ? "Siap" : "Belum siap"}`
    : resource.primaryMetric;

  return (
    <Link
      href={resource.href}
      className={cn(
        "group flex flex-col gap-4 rounded-3xl border px-4 py-4 transition-colors duration-200 md:flex-row md:items-center",
        emphasis
          ? "border-[#ead9a5] bg-[#fffdf1]"
          : "border-primary-100 bg-white hover:border-primary-200 hover:bg-primary-50/40",
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center text-primary-800">
        <meta.icon className="size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="truncate text-base font-semibold leading-6 text-secondary-900">
            {resource.title}
          </p>
          <span className="text-sm text-secondary-400">
            {resource.subjectCode ?? meta.label}
          </span>
        </div>
        <p className="mt-1 line-clamp-1 text-sm leading-6 text-secondary-500">
          {resource.description}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary-500">
          <StatusPill status={resource.status} />
          <span>{resource.updatedAt}</span>
          {resource.scheduledFor ? <span>{resource.scheduledFor}</span> : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 md:min-w-[128px] md:justify-end md:text-right">
        <p className="text-sm font-semibold text-secondary-900">
          {primaryMetric}
        </p>
        <ArrowRight className="size-4 text-secondary-400 transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

function QuickCreateGrid() {
  return (
    <div className="grid gap-2">
      {quickCreateItems.map((item) => (
        <Link
          className="group flex min-h-14 items-center gap-3 rounded-2xl border border-primary-200 bg-white px-3 py-2 transition-colors hover:border-primary-300 hover:bg-primary-50"
          href={item.href}
          key={item.label}
        >
          <div className="flex size-7 shrink-0 items-center justify-center text-primary-800">
            <item.icon className="size-4" />
          </div>
          <p className="min-w-0 flex-1 text-sm font-semibold text-secondary-900">
            {item.label}
          </p>
          <Plus className="size-4 shrink-0 text-secondary-400 transition-transform group-hover:rotate-90" />
        </Link>
      ))}
    </div>
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
  EmptyState,
  PageIntro,
  QuickCreateGrid,
  ResourceRow,
  SearchPanel,
  SectionHeading,
  StatusPill,
};

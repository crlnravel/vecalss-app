"use client";

import Link from "next/link";
import { ChevronRight, ClipboardList, Lock, Plus, Target } from "@/lib/icons";
import { useMemo, useState } from "react";

import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceStatusBadge,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_SURFACE_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SessionContext } from "@/lib/auth/types";
import { CatalogueSearchInput, PaginationControls } from "@/modules/mentor/components/kapten-ui";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

type TryoutItem = {
  description: string;
  id: string;
  locked: boolean;
  sections: Array<{ directQuestions?: Array<{ sourceQuestionId: string }> }>;
  status: "draft" | "published";
  title: string;
};

type TryoutStatusFilter = "" | TryoutItem["status"];

const tryoutStatusTabs: Array<{ label: string; value: TryoutStatusFilter }> = [
  { label: "Semua", value: "" },
  { label: "Diterbitkan", value: "published" },
  { label: "Draf", value: "draft" },
];

function TryoutStatusTabs({
  items,
  onChange,
  value,
}: {
  items: readonly TryoutItem[];
  onChange: (value: TryoutStatusFilter) => void;
  value: TryoutStatusFilter;
}) {
  const counts = useMemo(() => ({
    "": items.length,
    draft: items.filter((item) => item.status === "draft").length,
    published: items.filter((item) => item.status === "published").length,
  }), [items]);

  return (
    <div
      aria-label="Filter status Tryout"
      className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1"
      role="group"
    >
      {tryoutStatusTabs.map((tab) => {
        const isActive = value === tab.value;

        return (
          <button
            aria-pressed={isActive}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold text-secondary-500 transition-[background-color,color,box-shadow] duration-200 hover:text-secondary-900 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35",
              isActive && "bg-white text-secondary-900 shadow-[0_12px_28px_-22px_rgba(23,107,77,0.72)]",
            )}
            key={tab.value || "all"}
            onClick={() => onChange(tab.value)}
            type="button"
          >
            <span>{tab.label}</span>
            <span className="text-xs font-medium text-secondary-500">({counts[tab.value]})</span>
          </button>
        );
      })}
    </div>
  );
}

function TryoutCard({ item }: { item: TryoutItem }) {
  return (
    <Link
      aria-label={`Buka ${item.title}`}
      className={cn(
        REFERENCE_SURFACE_CLASS_NAMES.raised,
        REFERENCE_SURFACE_CLASS_NAMES.raisedInteractive,
        "group flex min-w-0 items-start justify-between gap-4 p-5 sm:items-center",
      )}
      href={`/mentor/tryout/${item.id}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">
          <ClipboardList aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-secondary-900">{item.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <ReferenceStatusBadge size="xs" status={item.status} />
            <ReferenceStatusBadge
              label={item.locked ? (
                <span aria-label="Tryout terkunci" className="inline-flex items-center gap-1" title="Tryout terkunci">
                  <Lock aria-hidden="true" className="size-3" />
                  Terkunci
                </span>
              ) : "Terbuka"}
              size="xs"
              status={item.locked ? "blocked" : "active"}
            />
          </div>
        </div>
      </div>
      <ChevronRight
        aria-hidden="true"
        className="mt-1 size-5 shrink-0 text-secondary-400 transition-transform duration-200 group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5 sm:mt-0"
      />
    </Link>
  );
}

function KaptenTryoutCataloguePageModule({ initialItems, session }: { initialItems: TryoutItem[]; session: SessionContext }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TryoutStatusFilter>("");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const filteredItems = initialItems.filter((item) => {
    const needle = query.trim().toLocaleLowerCase();
    return (!needle || [item.title, item.description, item.status, item.locked ? "terkunci" : ""].some((value) => value.toLocaleLowerCase().includes(needle)))
      && (!statusFilter || item.status === statusFilter);
  });
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const visiblePage = Math.min(page, pageCount);
  const visibleItems = filteredItems.slice((visiblePage - 1) * pageSize, visiblePage * pageSize);
  const clearFilters = () => {
    setQuery("");
    setStatusFilter("");
    setPage(1);
  };

  return (
    <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Tryout" searchPlaceholder="Cari Tryout..." session={session} sidebarAppearance="reference">
      <div className="space-y-8">
        <ReferencePageHeader
          actions={
            <Button
              aria-label="Buat Tryout"
              nativeButton={false}
              render={<Link href="/mentor/tryout/create" />}
              size="sm"
              variant="brand"
            >
              <Plus />
              Buat Tryout
            </Button>
          }
          description="Kelola simulasi ujian dan evaluasi belajar siswa."
          title="Tryout"
        />

        <div className="space-y-4">
          <TryoutStatusTabs
            items={initialItems}
            onChange={(value) => { setStatusFilter(value); setPage(1); }}
            value={statusFilter}
          />
          <div className="w-full max-w-2xl">
            <CatalogueSearchInput
              onChange={(value) => { setQuery(value); setPage(1); }}
              placeholder="Cari judul, deskripsi, atau status Tryout..."
              value={query}
            />
          </div>
        </div>

        <section aria-label="Daftar Tryout" className="grid gap-3">
          {visibleItems.length ? visibleItems.map((item) => <TryoutCard item={item} key={item.id} />) : initialItems.length === 0 ? (
            <ReferenceSurface className="min-h-[25rem]" variant="inset">
              <ReferenceEmptyState
                action={
                  <Button
                    nativeButton={false}
                    render={<Link href="/mentor/tryout/create" />}
                    size="sm"
                    variant="brand"
                  >
                    <Plus />
                    Buat Tryout pertama
                  </Button>
                }
                description="Buat simulasi pertama untuk membantu siswa berlatih dan mengukur kesiapan mereka."
                icon={Target}
                title="Belum ada Tryout"
              />
            </ReferenceSurface>
          ) : (
            <ReferenceSurface className="min-h-56" variant="inset">
              <ReferenceEmptyState
                action={
                  <Button onClick={clearFilters} size="sm" variant="brandOutline">
                    Hapus filter
                  </Button>
                }
                description="Coba kata kunci lain atau tampilkan semua status Tryout."
                icon={Target}
                title="Tidak ada Tryout yang cocok"
              />
            </ReferenceSurface>
          )}
        </section>
        {filteredItems.length ? <PaginationControls onPageChange={setPage} page={visiblePage} pageCount={pageCount} /> : null}
      </div>
    </MentorWorkspaceShell>
  );
}

export { KaptenTryoutCataloguePageModule };

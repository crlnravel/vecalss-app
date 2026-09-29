"use client";

import Link from "next/link";
import { ChevronRight, ClipboardList, Lock, Plus, Target } from "@/lib/icons";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceStatusBadge,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_SURFACE_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { CompactFilterTabs } from "@/components/ui/compact-filter-tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SessionContext } from "@/lib/auth/types";
import {
  CatalogueSearchInput,
  PaginationControls,
} from "@/modules/mentor/components/kapten-ui";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { MentorTryoutCreateDialog } from "@/modules/mentor/KaptenTryoutBuilderPageModule";

type TryoutItem = {
  description: string;
  id: string;
  isHidden?: boolean;
  locked: boolean;
  status: "draft" | "published" | "archived";
  title: string;
};

type TryoutStatusFilter = "" | TryoutItem["status"];

const tryoutStatusTabs: Array<{ label: string; value: TryoutStatusFilter }> = [
  { label: "Semua", value: "" },
  { label: "Diterbitkan", value: "published" },
  { label: "Draf", value: "draft" },
  { label: "Diarsipkan", value: "archived" },
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
  const counts = useMemo(
    () => ({
      "": items.length,
      archived: items.filter((item) => item.status === "archived").length,
      draft: items.filter((item) => item.status === "draft").length,
      published: items.filter((item) => item.status === "published").length,
    }),
    [items],
  );

  return (
    <CompactFilterTabs
      aria-label="Filter status Tryout"
      items={tryoutStatusTabs.map((tab) => ({
        label: (
          <>
            <span>{tab.label}</span>
            <span className="text-xs font-medium opacity-70">
              ({counts[tab.value]})
            </span>
          </>
        ),
        value: tab.value,
      }))}
      onValueChange={onChange}
      value={value}
    />
  );
}

function TryoutCard({ item }: { item: TryoutItem }) {
  const isArchived = item.status === "archived";
  const cardClassName = cn(
    REFERENCE_SURFACE_CLASS_NAMES.raised,
    !isArchived && REFERENCE_SURFACE_CLASS_NAMES.raisedStableInteractive,
    "flex min-w-0 items-center justify-between gap-4 rounded-3xl p-3 sm:gap-5 sm:p-5",
    !isArchived &&
      "group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/40",
  );
  const content = (
    <>
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">
          <ClipboardList aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 truncate text-base font-semibold text-secondary-900">
              {item.title}
            </h2>
            {item.locked ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span
                        aria-label="Tryout terkunci"
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-secondary-500 outline-none transition-colors hover:bg-primary-50 hover:text-secondary-900 focus-visible:ring-2 focus-visible:ring-primary-700/40"
                        role="img"
                        tabIndex={0}
                      />
                    }
                  >
                    <Lock aria-hidden="true" className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Tryout terkunci karena peserta sudah mulai mengerjakannya.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <ReferenceStatusBadge
              appearance="mentor"
              size="sm"
              status={item.status}
            />
            {item.isHidden ? (
              <ReferenceStatusBadge
                appearance="mentor"
                label="Disembunyikan"
                size="sm"
                status="blocked"
              />
            ) : null}
          </div>
        </div>
      </div>
      {!isArchived ? (
        <ChevronRight
          aria-hidden="true"
          className="size-5 shrink-0 text-secondary-400 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5 motion-safe:group-focus-visible:translate-x-0.5 motion-reduce:translate-x-0 motion-reduce:transition-none"
        />
      ) : null}
    </>
  );

  return isArchived ? (
    <article aria-label={`${item.title}, Tryout diarsipkan`} className={cardClassName}>
      {content}
    </article>
  ) : (
    <Link
      aria-label={`Buka ${item.title}`}
      className={cardClassName}
      href={`/mentor/tryout/${item.id}`}
    >
      {content}
    </Link>
  );
}

function KaptenTryoutCataloguePageModule({
  initialCreateDialogOpen = false,
  initialItems,
  session,
}: {
  initialCreateDialogOpen?: boolean;
  initialItems: TryoutItem[];
  session: SessionContext;
}) {
  const router = useRouter();
  const [createDialogOpen, setCreateDialogOpen] = useState(
    initialCreateDialogOpen,
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TryoutStatusFilter>("");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const filteredItems = initialItems.filter((item) => {
    const needle = query.trim().toLocaleLowerCase();
    return (
      (!needle ||
        [
          item.title,
          item.description,
          item.status,
          item.locked ? "terkunci" : "",
        ].some((value) => value.toLocaleLowerCase().includes(needle))) &&
      (!statusFilter || item.status === statusFilter)
    );
  });
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const visiblePage = Math.min(page, pageCount);
  const visibleItems = filteredItems.slice(
    (visiblePage - 1) * pageSize,
    visiblePage * pageSize,
  );
  const clearFilters = () => {
    setQuery("");
    setStatusFilter("");
    setPage(1);
  };

  function handleCreateDialogOpenChange(open: boolean) {
    setCreateDialogOpen(open);
    if (!open && initialCreateDialogOpen) {
      router.replace("/mentor/tryout", { scroll: false });
    }
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Tryout"
      searchPlaceholder="Cari Tryout..."
      session={session}
      sidebarAppearance="reference"
    >
      <div className="space-y-8">
        <ReferencePageHeader
          actions={
            <Button
              aria-label="Buat Tryout"
              onClick={() => setCreateDialogOpen(true)}
              size="default"
              type="button"
              variant="brand"
            >
              <Plus />
              Buat Tryout
            </Button>
          }
          title="Tryout"
        />

        <div className="space-y-4">
          <div className="w-full">
            <CatalogueSearchInput
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              placeholder="Cari judul, deskripsi, atau status Tryout..."
              value={query}
            />
          </div>
          <TryoutStatusTabs
            items={initialItems}
            onChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
            value={statusFilter}
          />
        </div>

        <section aria-label="Daftar Tryout" className="grid gap-3">
          {visibleItems.length ? (
            visibleItems.map((item) => <TryoutCard item={item} key={item.id} />)
          ) : initialItems.length === 0 ? (
            <ReferenceSurface className="min-h-[25rem]" variant="inset">
              <ReferenceEmptyState
                action={
                  <Button
                    onClick={() => setCreateDialogOpen(true)}
                    size="default"
                    type="button"
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
                  <Button
                    onClick={clearFilters}
                    size="default"
                    variant="brandOutline"
                  >
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
        {filteredItems.length ? (
          <PaginationControls
            onPageChange={setPage}
            page={visiblePage}
            pageCount={pageCount}
          />
        ) : null}
      </div>
      <MentorTryoutCreateDialog
        onOpenChange={handleCreateDialogOpenChange}
        open={createDialogOpen}
      />
    </MentorWorkspaceShell>
  );
}

export { KaptenTryoutCataloguePageModule };

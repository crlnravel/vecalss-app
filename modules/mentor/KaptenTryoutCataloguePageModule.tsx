"use client";

import Link from "next/link";
import { ChevronRight, CircleHelp, ClipboardList, Lock, Plus } from "@/lib/icons";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionContext } from "@/lib/auth/types";
import { CatalogueFilter, CatalogueSearchInput, PageIntro, PaginationControls, StatusPill } from "@/modules/mentor/components/kapten-ui";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

type TryoutItem = {
  description: string;
  id: string;
  locked: boolean;
  sections: Array<{ directQuestions?: Array<{ sourceQuestionId: string }>; packageVersionId?: string }>;
  status: "draft" | "published";
  title: string;
};

function KaptenTryoutCataloguePageModule({ initialItems, session }: { initialItems: TryoutItem[]; session: SessionContext }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [readinessFilter, setReadinessFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const filteredItems = initialItems.filter((item) => {
    const boundCount = item.sections.filter((section) => section.packageVersionId || section.directQuestions?.length).length;
    const needle = query.trim().toLocaleLowerCase();
    return (!needle || [item.title, item.description, item.status, item.locked ? "terkunci" : ""].some((value) => value.toLocaleLowerCase().includes(needle)))
      && (!statusFilter || item.status === statusFilter)
      && (!readinessFilter || (readinessFilter === "complete" ? boundCount === 7 : boundCount < 7));
  });
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const visiblePage = Math.min(page, pageCount);
  const visibleItems = filteredItems.slice((visiblePage - 1) * pageSize, visiblePage * pageSize);

  return (
    <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Tryout" searchPlaceholder="Cari Tryout..." session={session}>
      <div className="space-y-3">
      <PageIntro
        action={
          <>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger render={<Button aria-label="Tentang Tryout" size="icon-sm" title="Tentang Tryout" variant="ghost" />}>
                  <CircleHelp />
                </TooltipTrigger>
                <TooltipContent>Tryout terdiri dari tujuh Test dan menggunakan versi Paket Soal yang sudah siap.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button aria-label="Buat Tryout" nativeButton={false} render={<Link href="/mentor/tryout/create" />} size="icon-sm" title="Buat Tryout" variant="brand">
              <Plus />
            </Button>
          </>
        }
        title="Tryout"
      />

      <div className="space-y-3">
        <CatalogueSearchInput
          onChange={(value) => { setQuery(value); setPage(1); }}
          placeholder="Cari judul, deskripsi, atau status Tryout..."
          value={query}
        />
        <div className="flex flex-wrap items-center gap-2">
          <CatalogueFilter
            label="Filter status"
            onValueChange={(value) => { setStatusFilter(value); setPage(1); }}
            options={[
              { label: "Semua status", value: "" },
              { label: "Draf", value: "draft" },
              { label: "Diterbitkan", value: "published" },
            ]}
            value={statusFilter}
          />
          <CatalogueFilter
            label="Filter kesiapan Paket"
            onValueChange={(value) => { setReadinessFilter(value); setPage(1); }}
            options={[
              { label: "Semua kesiapan", value: "" },
              { label: "7/7 Paket terikat", value: "complete" },
              { label: "Paket belum lengkap", value: "incomplete" },
            ]}
            value={readinessFilter}
          />
        </div>
      </div>

      <section className="grid gap-3">
        {visibleItems.length ? visibleItems.map((item) => {
          return (
            <Link aria-label={`Buka ${item.title}`} className="group grid gap-4 rounded-3xl border border-primary-100 bg-white p-4 shadow-sm transition-[transform,border-color,box-shadow] duration-200 motion-safe:hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-[0_18px_38px_-28px_rgba(1,76,56,0.38)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-700/20 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" href={`/mentor/tryout/${item.id}`} key={item.id}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ClipboardList className="size-4 text-primary-800" />
                  <h2 className="truncate font-semibold text-secondary-900">{item.title}</h2>
                  <StatusPill status={item.status} />
                  {item.locked ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-secondary-500"><Lock className="size-3" />Terkunci</span> : null}
                </div>
                {item.description ? <p className="mt-1 line-clamp-1 text-sm text-secondary-500">{item.description}</p> : null}
              </div>
              <ChevronRight aria-hidden className="size-5 justify-self-end text-secondary-400 transition-transform group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5" />
            </Link>
          );
        }) : <div className="rounded-3xl border border-dashed border-primary-200 px-5 py-12 text-center text-sm text-secondary-500">{initialItems.length ? "Tidak ada Tryout yang cocok dengan pencarian atau filter ini." : "Belum ada Tryout."}</div>}
      </section>
      {filteredItems.length ? <PaginationControls onPageChange={setPage} page={visiblePage} pageCount={pageCount} /> : null}
      </div>
    </MentorWorkspaceShell>
  );
}

export { KaptenTryoutCataloguePageModule };

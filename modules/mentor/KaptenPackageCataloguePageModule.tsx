"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { DataTableColumn, DataTableFilter } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronRight,
  Ellipsis,
  Eye,
  PackageCheck,
  Pencil,
  Plus,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { MentorCatalogueTable } from "@/modules/mentor/components/mentor-catalogue-table";
import { kaptenSubjects } from "@/modules/mentor/mock-data";

type PackageItem = {
  description: string;
  id: string;
  items: Array<{ sourceQuestionId: string }>;
  latestReadyVersionNo?: number;
  sourceBankName: string;
  status: "draft" | "ready";
  subtest: string;
  title: string;
  updatedAt: number;
};

function catalogueHref(query: string, page: number, status: string, subtest: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  if (subtest) params.set("subtest", subtest);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `/mentor/packages${search ? `?${search}` : ""}`;
}

const packageDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function packageStatusCopy(status: PackageItem["status"]) {
  return status === "ready" ? "Siap" : "Draf";
}

function PackageStatusPill({ status }: { status: PackageItem["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        status === "ready"
          ? "border-primary-200 bg-primary-50 text-primary-800"
          : "border-[#ead9a5] bg-[#fff8df] text-[#856300]",
      )}
    >
      {packageStatusCopy(status)}
    </span>
  );
}

function KaptenPackageCataloguePageModule({ items, page, query, status, subtest, totalItems, totalPages }: { items: PackageItem[]; page: number; query: string; status: string; subtest: string; totalItems: number; totalPages: number }) {
  const router = useRouter();
  const [isCataloguePending, startCatalogueTransition] = useTransition();

  function navigateCatalogue(href: string) {
    startCatalogueTransition(() => router.push(href));
  }

  const columns: DataTableColumn<PackageItem>[] = [
    {
      cell: (item) => (
        <div className="flex min-w-0 max-w-full items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-800"><PackageCheck size={18} /></span>
          <div className="min-w-0">
            <Link aria-label={`Buka Paket Soal ${item.title}`} className="block min-w-0 max-w-full truncate font-semibold text-secondary-900 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/20" href={`/mentor/packages/${item.id}`} title={item.title}>{item.title}</Link>
            {item.description ? <p className="mt-1 max-w-[34rem] truncate text-xs text-secondary-500">{item.description}</p> : null}
            <span className="mt-1 block text-xs text-secondary-500">{item.items.length} soal</span>
          </div>
        </div>
      ),
      headerClassName: "min-w-[14rem]",
      hideable: false,
      id: "package",
      label: "Paket Soal",
      width: 38,
    },
    {
      cell: (item) => <span className="block max-w-[15rem] truncate text-sm text-secondary-700" title={item.sourceBankName}>{item.sourceBankName}</span>,
      headerClassName: "min-w-[12rem]",
      id: "source",
      label: "Bank sumber",
      width: 24,
    },
    {
      cell: (item) => <span className="inline-flex rounded-full border border-primary-100 bg-primary-50/60 px-2.5 py-1 text-xs font-semibold text-primary-800">{item.subtest}</span>,
      headerClassName: "min-w-[7rem]",
      id: "subtest",
      label: "Subtest",
      width: 12,
    },
    {
      cell: (item) => <PackageStatusPill status={item.status} />,
      headerClassName: "min-w-[7rem]",
      id: "status",
      label: "Status",
      width: 12,
    },
    {
      cell: (item) => <time className="text-sm text-secondary-600" dateTime={new Date(item.updatedAt).toISOString()}>{packageDateFormatter.format(new Date(item.updatedAt))}</time>,
      headerClassName: "min-w-[9rem]",
      id: "updated",
      label: "Diperbarui",
      width: 14,
    },
    {
      cell: (item) => (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button aria-label={`Aksi untuk ${item.title}`} size="icon-sm" type="button" variant="ghost" />}>
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => router.push(`/mentor/packages/${item.id}`)}><Eye />Buka detail</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push(`/mentor/packages/${item.id}/edit`)}><Pencil />Edit informasi</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      cellClassName: "text-right",
      headerClassName: "min-w-[5rem] text-right",
      id: "actions",
      label: "Aksi",
      width: 10,
    },
  ];

  const filters: DataTableFilter[] = [
    ...(subtest ? [{ id: "subtest", label: "Subtest", value: subtest, href: catalogueHref(query, 1, status, "") }] : []),
    ...(status ? [{ id: "status", label: "Status", value: packageStatusCopy(status as PackageItem["status"]), href: catalogueHref(query, 1, "", subtest) }] : []),
  ];
  const filterPanel = (
    <div className="space-y-3 p-1">
      <label className="block space-y-1.5 text-xs font-semibold tracking-[0.02em] text-secondary-500" htmlFor="package-subtest-filter">
        <span>Subtest</span>
        <select className="min-h-10 w-full rounded-lg border border-primary-100 bg-white px-3 text-sm font-normal tracking-normal text-secondary-900 outline-none focus:border-primary-300 focus:ring-3 focus:ring-primary-100" id="package-subtest-filter" onChange={(event) => navigateCatalogue(catalogueHref(query, 1, status, event.target.value))} value={subtest}>
          <option value="">Semua Subtest</option>
          {kaptenSubjects.map((subject) => <option key={subject.code} value={subject.code}>{subject.code} · {subject.name}</option>)}
        </select>
      </label>
      <label className="block space-y-1.5 text-xs font-semibold tracking-[0.02em] text-secondary-500" htmlFor="package-status-filter">
        <span>Status</span>
        <select className="min-h-10 w-full rounded-lg border border-primary-100 bg-white px-3 text-sm font-normal tracking-normal text-secondary-900 outline-none focus:border-primary-300 focus:ring-3 focus:ring-primary-100" id="package-status-filter" onChange={(event) => navigateCatalogue(catalogueHref(query, 1, event.target.value, subtest))} value={status}>
          <option value="">Semua status</option>
          <option value="draft">Draf</option>
          <option value="ready">Siap</option>
        </select>
      </label>
    </div>
  );
  const previousPageHref = page > 1 ? catalogueHref(query, page - 1, status, subtest) : undefined;
  const nextPageHref = page < totalPages ? catalogueHref(query, page + 1, status, subtest) : undefined;
  const hasActiveCatalogueConstraints = Boolean(query || status || subtest);
  const emptyStateTitle = query
    ? "Tidak ada Paket Soal yang cocok dengan pencarian ini."
    : hasActiveCatalogueConstraints
      ? "Tidak ada Paket Soal yang cocok dengan filter ini."
      : "Belum ada Paket Soal.";
  const emptyStateDescription = query
    ? "Coba kata kunci lain atau bersihkan pencarian untuk melihat semua Paket Soal."
    : hasActiveCatalogueConstraints
      ? "Coba ubah filter atau bersihkan filter untuk melihat semua Paket Soal."
      : "Buat paket dari bank soal yang sudah siap dipakai.";

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-4xl leading-tight font-semibold text-secondary-900 md:text-5xl">Paket Soal</h1>
        <Button aria-label="Buat Paket Soal" nativeButton={false} render={<Link href="/mentor/packages/create" />} size="icon-sm" title="Buat Paket Soal" variant="brand"><Plus /></Button>
      </section>

      <div className="min-w-0">
        <MentorCatalogueTable
          breadcrumb={<nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm text-secondary-500"><span className="shrink-0 font-semibold text-secondary-900">Paket Soal</span></nav>}
          caption="Daftar Paket Soal"
          clearFiltersHref={catalogueHref("", 1, "", "")}
          columns={columns}
          emptyState={<div className="mx-auto flex min-w-0 max-w-[calc(100vw-2rem)] flex-col items-center whitespace-normal py-2 text-center"><PackageCheck className="size-7 text-primary-300" /><h2 className="mt-3 font-semibold text-secondary-900">{emptyStateTitle}</h2><p className="mt-1 max-w-[42ch] text-sm font-normal leading-6 text-secondary-600">{emptyStateDescription}</p>{!hasActiveCatalogueConstraints ? <Button className="mt-5" nativeButton={false} render={<Link href="/mentor/packages/create" />} size="sm" variant="brand"><Plus />Buat Paket Soal</Button> : null}</div>}
          filterPanel={filterPanel}
          filters={filters}
          getRowId={(item) => item.id}
          headingIcon={<PackageCheck size={18} />}
          isLoading={isCataloguePending}
          loadingLabel="Memuat Paket Soal…"
          rows={items}
          search={{ action: "/mentor/packages", clearHref: catalogueHref("", 1, status, subtest), hiddenFields: { ...(status ? { status } : {}), ...(subtest ? { subtest } : {}) }, label: "Cari Paket Soal", placeholder: "Cari judul, deskripsi, atau Subtest…", value: query }}
          tableClassName="min-w-[880px]"
        />

        {totalItems ? (
          <nav aria-label="Paginasi paket soal" className="flex items-center justify-center gap-2 pt-2">
            {previousPageHref ? (
              <Button aria-label="Halaman sebelumnya" nativeButton={false} render={<Link href={previousPageHref} />} size="icon-sm" type="button" variant="brandOutline"><ChevronRight className="rotate-180" /></Button>
            ) : (
              <Button aria-label="Halaman sebelumnya" disabled size="icon-sm" type="button" variant="brandOutline"><ChevronRight className="rotate-180" /></Button>
            )}
            <span aria-current="page" className="text-sm text-secondary-500">Halaman {page} dari {totalPages}</span>
            {nextPageHref ? (
              <Button aria-label="Halaman berikutnya" nativeButton={false} render={<Link href={nextPageHref} />} size="icon-sm" type="button" variant="brandOutline"><ChevronRight /></Button>
            ) : (
              <Button aria-label="Halaman berikutnya" disabled size="icon-sm" type="button" variant="brandOutline"><ChevronRight /></Button>
            )}
          </nav>
        ) : null}
      </div>
    </div>
  );
}

export { KaptenPackageCataloguePageModule };

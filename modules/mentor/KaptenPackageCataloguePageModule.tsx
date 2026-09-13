"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  ReferencePageHeader,
} from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
  REFERENCE_SURFACE_CLASS_NAMES,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import type { DataTableColumn, DataTableFilter } from "@/components/ui/data-table";
import { ChevronRight, PackageCheck, Plus } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { DropdownField } from "@/modules/mentor/components/kapten-ui";
import { MentorCatalogueTable } from "@/modules/mentor/components/mentor-catalogue-table";
import { kaptenSubjects } from "@/modules/mentor/mock-data";

type PackageItem = {
  availability: "draft" | "ready";
  hasDraftChanges: boolean;
  id: string;
  sourceBankName: string;
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
const packageCompactDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
});

const packageCatalogueColumns: DataTableColumn<PackageItem>[] = [
  {
    cell: (item) => <div className="min-w-0 max-w-full"><Link aria-label={`Buka Paket Soal ${item.title}`} className="block min-w-0 max-w-full truncate font-semibold text-secondary-900 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/20" href={`/mentor/packages/${item.id}`} title={item.title}>{item.title}</Link></div>,
    cellClassName: "min-w-0 whitespace-normal px-1.5 sm:px-5",
    headerClassName: "min-w-0 whitespace-normal break-words overflow-hidden rounded-l-xl px-1.5 sm:px-5 lg:min-w-[12rem]",
    hideable: false,
    id: "package",
    label: "Paket Soal",
    width: 38,
  },
  {
    cell: (item) => <span className="block min-w-0 max-w-full truncate text-sm text-secondary-700" title={item.sourceBankName}>{item.sourceBankName}</span>,
    cellClassName: "min-w-0 whitespace-normal px-1.5 sm:px-5",
    headerClassName: "min-w-0 whitespace-normal break-words overflow-hidden px-1.5 sm:px-5 lg:min-w-[10rem]",
    id: "source",
    label: "Bank sumber",
    width: 24,
  },
  {
    cell: (item) => <span className="inline-flex max-w-full truncate rounded-full border border-primary-100 bg-primary-50/60 px-2.5 py-1 text-xs font-semibold text-primary-800" title={item.subtest}>{item.subtest}</span>,
    cellClassName: "min-w-0 whitespace-normal px-1.5 sm:px-5",
    headerClassName: "min-w-0 whitespace-normal break-words overflow-hidden px-1.5 sm:px-5 lg:min-w-[6rem]",
    id: "subtest",
    label: "Subtest",
    width: 12,
  },
  {
    cell: (item) => <div className="grid min-w-0 max-w-full justify-items-start gap-1 overflow-hidden"><PackageStatusPill status={item.availability} />{item.hasDraftChanges ? <span className="inline-flex max-w-full truncate rounded-full border border-warning-200 bg-warning-50 px-2.5 py-1 text-xs font-semibold text-warning-900" title="Perubahan draf"><span className="sm:hidden">Draf baru</span><span className="hidden sm:inline">Perubahan draf</span></span> : null}<PackageRowAction item={item} /></div>,
    cellClassName: "min-w-0 whitespace-normal px-1.5 sm:px-5",
    headerClassName: "min-w-0 whitespace-normal break-words overflow-hidden px-1.5 sm:px-5 lg:min-w-[8rem]",
    id: "status",
    label: "Status",
    width: 16,
  },
  {
    cell: (item) => {
      const date = new Date(item.updatedAt);
      const fullDate = packageDateFormatter.format(date);
      return <time aria-label={fullDate} className="block min-w-0 max-w-full truncate text-sm text-secondary-600" dateTime={date.toISOString()} title={fullDate}><span className="sm:hidden">{packageCompactDateFormatter.format(date)}</span><span className="hidden sm:inline">{fullDate}</span></time>;
    },
    cellClassName: "min-w-0 max-w-full overflow-hidden whitespace-normal px-1.5 sm:px-5",
    headerClassName: "min-w-0 whitespace-normal break-words overflow-hidden px-1.5 sm:px-5 lg:min-w-[7rem]",
    id: "updated",
    label: "Diperbarui",
    width: 10,
  },
];

function packageStatusCopy(status: PackageItem["availability"]) {
  return status === "ready" ? "Siap" : "Draf";
}

function PackageStatusPill({ status }: { status: PackageItem["availability"] }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full border px-2.5 py-1 text-xs font-semibold",
        status === "ready"
          ? "border-primary-200 bg-primary-50 text-primary-800"
          : "border-[var(--warning-200)] bg-[var(--warning-50)] text-[var(--voyage-warm-sun-ink)]",
      )}
    >
      {packageStatusCopy(status)}
    </span>
  );
}

function PackageRowAction({ item }: { item: PackageItem }) {
  if (item.availability !== "draft" && !item.hasDraftChanges) return null;

  const label = item.availability === "draft" ? "Siapkan versi pertama" : "Lanjutkan perubahan";
  return (
    <Button
      aria-label={`${label} untuk ${item.title}`}
      className="mt-2 h-10 min-h-10 min-w-10 max-w-full p-0 sm:h-auto sm:min-h-6 sm:min-w-0 sm:px-2.5 sm:py-1 sm:text-left sm:whitespace-normal"
      nativeButton={false}
      render={<Link href={`/mentor/packages/${item.id}/versions/new`} />}
      size="xs"
      title={label}
      variant="brand"
    >
      <span className="hidden sm:inline">{label}</span>
      <ChevronRight />
    </Button>
  );
}


function PackageCatalogueFilters({ navigateCatalogue, query, status, subtest }: { navigateCatalogue: (href: string) => void; query: string; status: string; subtest: string }) {
  const filters: DataTableFilter[] = [
    ...(subtest ? [{ id: "subtest", label: "Subtest", value: subtest, href: catalogueHref(query, 1, status, "") }] : []),
    ...(status ? [{ id: "status", label: "Status", value: packageStatusCopy(status as PackageItem["availability"]), href: catalogueHref(query, 1, "", subtest) }] : []),
  ];
  const filterPanel = (
    <div className="space-y-3 p-1">
      <label className={cn("block space-y-1.5", REFERENCE_FIELD_LABEL_CLASS_NAME)} htmlFor="package-subtest-filter">
        <span>Subtest</span>
        <DropdownField ariaLabel="Filter Subtest" className={REFERENCE_CONTROL_CLASS_NAMES.select} id="package-subtest-filter" onValueChange={(value) => navigateCatalogue(catalogueHref(query, 1, status, value))} options={kaptenSubjects.map((subject) => ({ label: subject.code + " · " + subject.name, value: subject.code }))} placeholder="Semua Subtest" value={subtest} />
      </label>
      <label className={cn("block space-y-1.5", REFERENCE_FIELD_LABEL_CLASS_NAME)} htmlFor="package-status-filter">
        <span>Status</span>
        <DropdownField ariaLabel="Filter Status" className={REFERENCE_CONTROL_CLASS_NAMES.select} id="package-status-filter" onValueChange={(value) => navigateCatalogue(catalogueHref(query, 1, value, subtest))} options={[{ label: "Draf", value: "draft" }, { label: "Siap", value: "ready" }]} placeholder="Semua status" value={status} />
      </label>
    </div>
  );
  return { filterPanel, filters };
}

function PackageCatalogueEmptyState({ hasActiveConstraints, query }: { hasActiveConstraints: boolean; query: string }) {
  const title = query ? "Tidak ada Paket Soal yang cocok dengan pencarian ini." : hasActiveConstraints ? "Tidak ada Paket Soal yang cocok dengan filter ini." : "Belum ada Paket Soal.";
  const description = query ? "Coba kata kunci lain atau bersihkan pencarian untuk melihat semua Paket Soal." : hasActiveConstraints ? "Coba ubah filter atau bersihkan filter untuk melihat semua Paket Soal." : "Buat paket dari bank soal yang sudah siap dipakai.";
  return <div className="mx-auto flex min-w-0 max-w-[calc(100vw-2rem)] flex-col items-center whitespace-normal py-2 text-center"><PackageCheck className="size-7 text-primary-300" /><h2 className="mt-3 font-semibold text-secondary-900">{title}</h2><p className="mt-1 max-w-[42ch] text-sm font-normal leading-6 text-secondary-600">{description}</p>{!hasActiveConstraints ? <Button className="mt-5" nativeButton={false} render={<Link href="/mentor/packages/create" />} size="sm" variant="brand"><Plus />Buat Paket Soal</Button> : null}</div>;
}

function PackageCataloguePagination({ nextPageHref, page, previousPageHref, totalItems, totalPages }: { nextPageHref?: string; page: number; previousPageHref?: string; totalItems: number; totalPages: number }) {
  if (!totalItems) return null;
  return <nav aria-label="Paginasi paket soal" className="flex items-center justify-center gap-2 pt-2">
    {previousPageHref ? <Button aria-label="Halaman sebelumnya" nativeButton={false} render={<Link href={previousPageHref} />} size="icon-sm" type="button" variant="reference"><ChevronRight className="rotate-180" /></Button> : <Button aria-label="Halaman sebelumnya" disabled size="icon-sm" type="button" variant="reference"><ChevronRight className="rotate-180" /></Button>}
    <span aria-current="page" className="text-sm text-secondary-500">Halaman {page} dari {totalPages}</span>
    {nextPageHref ? <Button aria-label="Halaman berikutnya" nativeButton={false} render={<Link href={nextPageHref} />} size="icon-sm" type="button" variant="reference"><ChevronRight /></Button> : <Button aria-label="Halaman berikutnya" disabled size="icon-sm" type="button" variant="reference"><ChevronRight /></Button>}
  </nav>;
}

function PackageCatalogueContent({ isCataloguePending, items, navigateCatalogue, page, query, status, subtest, totalItems, totalPages }: { isCataloguePending: boolean; items: PackageItem[]; navigateCatalogue: (href: string) => void; page: number; query: string; status: string; subtest: string; totalItems: number; totalPages: number }) {
  const { filterPanel, filters } = PackageCatalogueFilters({ navigateCatalogue, query, status, subtest });
  const previousPageHref = page > 1 ? catalogueHref(query, page - 1, status, subtest) : undefined;
  const nextPageHref = page < totalPages ? catalogueHref(query, page + 1, status, subtest) : undefined;
  const hasActiveConstraints = Boolean(query || status || subtest);
  return (
    <div className="min-w-0">
      <MentorCatalogueTable
        breadcrumb={<nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm text-secondary-500"><span className="shrink-0 font-semibold text-secondary-900">Paket Soal</span></nav>}
        caption="Daftar Paket Soal"
        clearFiltersHref={catalogueHref("", 1, "", "")}
        columns={packageCatalogueColumns}
        emptyState={<PackageCatalogueEmptyState hasActiveConstraints={hasActiveConstraints} query={query} />}
        filterPanel={filterPanel}
        filters={filters}
        getRowId={(item) => item.id}
        isLoading={isCataloguePending}
        loadingLabel="Memuat Paket Soal…"
        rows={items}
        search={{ action: "/mentor/packages", clearHref: catalogueHref("", 1, status, subtest), hiddenFields: { ...(status ? { status } : {}), ...(subtest ? { subtest } : {}) }, label: "Cari Paket Soal", placeholder: "Cari judul, deskripsi, atau Subtest…", value: query }}
        tableClassName="min-w-0"
        wrapperClassName={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "min-w-0")}
      />
      <PackageCataloguePagination nextPageHref={nextPageHref} page={page} previousPageHref={previousPageHref} totalItems={totalItems} totalPages={totalPages} />
    </div>
  );
}

function KaptenPackageCataloguePageModule({ items, page, query, status, subtest, totalItems, totalPages }: { items: PackageItem[]; page: number; query: string; status: string; subtest: string; totalItems: number; totalPages: number }) {
  const router = useRouter();
  const [isCataloguePending, startCatalogueTransition] = useTransition();
  const navigateCatalogue = (href: string) => startCatalogueTransition(() => router.push(href));

  return (
    <div className="space-y-8">
      <ReferencePageHeader
        actions={<Button nativeButton={false} render={<Link href="/mentor/packages/create" />} size="sm" variant="brand"><Plus />Buat Paket Soal</Button>}
        description="Kelola paket soal yang siap digunakan dalam Tryout."
        title="Paket Soal"
      />
      <PackageCatalogueContent isCataloguePending={isCataloguePending} items={items} navigateCatalogue={navigateCatalogue} page={page} query={query} status={status} subtest={subtest} totalItems={totalItems} totalPages={totalPages} />
    </div>
  );
}
export { KaptenPackageCataloguePageModule };

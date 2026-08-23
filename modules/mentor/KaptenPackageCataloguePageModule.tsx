"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { DataTableColumn, DataTableFilter } from "@/components/ui/data-table";
import { ChevronRight, PackageCheck, Plus } from "@/lib/icons";
import { MentorCatalogueTable } from "@/modules/mentor/components/mentor-catalogue-table";
import { PaginationLinks } from "@/modules/mentor/components/kapten-ui";
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

function KaptenPackageCataloguePageModule({ items, page, query, status, subtest, totalItems, totalPages }: { items: PackageItem[]; page: number; query: string; status: string; subtest: string; totalItems: number; totalPages: number }) {
  const router = useRouter();

  const columns: DataTableColumn<PackageItem>[] = [
    {
      cell: (item) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-800"><PackageCheck size={18} /></span>
          <div className="min-w-0">
            <Link aria-label={`Buka Paket Soal ${item.title}`} className="block truncate font-semibold text-secondary-900 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/20" href={`/mentor/packages/${item.id}`}>{item.title}</Link>
            {item.description ? <p className="mt-1 max-w-[28rem] truncate text-xs text-secondary-500">{item.description}</p> : null}
          </div>
        </div>
      ),
      headerClassName: "min-w-[18rem]",
      hideable: false,
      id: "package",
      label: "Paket Soal",
      width: 32,
    },
    {
      cell: (item) => <span className="block max-w-[15rem] truncate text-sm text-secondary-700" title={item.sourceBankName}>{item.sourceBankName}</span>,
      id: "source",
      label: "Bank sumber",
      width: 20,
    },
    {
      cell: (item) => <span className="inline-flex rounded-full border border-primary-100 bg-primary-50/60 px-2.5 py-1 text-xs font-semibold text-primary-800">{item.subtest}</span>,
      id: "subtest",
      label: "Subtest",
      width: 12,
    },
    {
      cell: (item) => <span className="tabular-nums text-secondary-700">{item.items.length}</span>,
      id: "questions",
      label: "Soal",
      width: 10,
    },
    {
      cell: (item) => <span className={item.status === "ready" ? "inline-flex rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-800" : "inline-flex rounded-full border border-[#ead9a5] bg-[#fff8df] px-2.5 py-1 text-xs font-semibold text-[#856300]"}>{packageStatusCopy(item.status)}</span>,
      id: "status",
      label: "Status",
      width: 12,
    },
    {
      cell: (item) => <time className="text-sm text-secondary-600" dateTime={new Date(item.updatedAt).toISOString()}>{packageDateFormatter.format(new Date(item.updatedAt))}</time>,
      id: "updated",
      label: "Diperbarui",
      width: 14,
    },
    {
      cell: (item) => <Button aria-label={`Buka Paket Soal ${item.title}`} nativeButton={false} render={<Link href={`/mentor/packages/${item.id}`} />} size="sm" type="button" variant="ghost">Buka</Button>,
      cellClassName: "text-right",
      headerClassName: "text-right",
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
        <select className="min-h-10 w-full rounded-lg border border-primary-100 bg-white px-3 text-sm font-normal tracking-normal text-secondary-900 outline-none focus:border-primary-300 focus:ring-3 focus:ring-primary-100" id="package-subtest-filter" onChange={(event) => router.push(catalogueHref(query, 1, status, event.target.value))} value={subtest}>
          <option value="">Semua Subtest</option>
          {kaptenSubjects.map((subject) => <option key={subject.code} value={subject.code}>{subject.code} · {subject.name}</option>)}
        </select>
      </label>
      <label className="block space-y-1.5 text-xs font-semibold tracking-[0.02em] text-secondary-500" htmlFor="package-status-filter">
        <span>Status</span>
        <select className="min-h-10 w-full rounded-lg border border-primary-100 bg-white px-3 text-sm font-normal tracking-normal text-secondary-900 outline-none focus:border-primary-300 focus:ring-3 focus:ring-primary-100" id="package-status-filter" onChange={(event) => router.push(catalogueHref(query, 1, event.target.value, subtest))} value={status}>
          <option value="">Semua status</option>
          <option value="draft">Draf</option>
          <option value="ready">Siap</option>
        </select>
      </label>
    </div>
  );

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl leading-tight font-semibold text-secondary-900 md:text-5xl">Paket Soal</h1>
          <p className="mt-2 text-sm text-secondary-500">Kelola informasi Paket dan versi soal siap pakai.</p>
        </div>
        <Button aria-label="Buat Paket Soal" nativeButton={false} render={<Link href="/mentor/packages/create" />} size="sm" title="Buat Paket Soal" variant="brand"><Plus />Buat Paket Soal</Button>
      </section>

      <MentorCatalogueTable
        breadcrumb={<nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm text-secondary-500"><Link className="shrink-0 rounded-lg px-1.5 py-1 hover:bg-primary-50 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-200" href="/mentor">Mentor</Link><ChevronRight className="size-3.5 shrink-0 text-secondary-300" /><span className="shrink-0 font-semibold text-secondary-900">Paket Soal</span></nav>}
        caption="Daftar Paket Soal"
        clearFiltersHref={catalogueHref("", 1, "", "")}
        columns={columns}
        emptyState={<div className="py-2 text-left"><PackageCheck className="size-7 text-primary-300" /><h2 className="mt-3 font-semibold text-secondary-900">{query ? "Tidak ada Paket Soal yang cocok dengan pencarian ini." : "Belum ada Paket Soal."}</h2><p className="mt-1 text-sm font-normal leading-6 text-secondary-600">Buat paket dari bank soal yang sudah siap dipakai.</p><Button className="mt-5" nativeButton={false} render={<Link href="/mentor/packages/create" />} size="sm" variant="brand">Buat Paket Soal</Button></div>}
        filterPanel={filterPanel}
        filters={filters}
        getRowId={(item) => item.id}
        headingIcon={<PackageCheck size={18} />}
        rows={items}
        search={{ action: "/mentor/packages", clearHref: catalogueHref("", 1, status, subtest), hiddenFields: { ...(status ? { status } : {}), ...(subtest ? { subtest } : {}) }, label: "Cari Paket Soal", placeholder: "Cari judul, deskripsi, atau Subtest…", value: query }}
        tableClassName="min-w-[980px]"
      />

      {totalItems ? <PaginationLinks nextHref={page < totalPages ? catalogueHref(query, page + 1, status, subtest) : undefined} page={page} pageCount={totalPages} previousHref={page > 1 ? catalogueHref(query, page - 1, status, subtest) : undefined} /> : null}
    </div>
  );
}

export { KaptenPackageCataloguePageModule };

"use client";

import Link from "next/link";
import { ChevronRight, PackageCheck, Plus, Search } from "@/lib/icons";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CatalogueFilter, PaginationLinks } from "@/modules/mentor/components/kapten-ui";
import { kaptenSubjects } from "@/modules/mentor/mock-data";

type PackageItem = {
  description: string;
  id: string;
  subtest: string;
  title: string;
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

function KaptenPackageCataloguePageModule({ items, page, query, status, subtest, totalItems, totalPages }: { items: PackageItem[]; page: number; query: string; status: string; subtest: string; totalItems: number; totalPages: number }) {
  const router = useRouter();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl leading-tight font-semibold text-secondary-900 md:text-5xl">Paket Soal</h1>
          <p className="mt-2 text-sm text-secondary-500">Kelola informasi Paket dan versi soal siap pakai.</p>
        </div>
        <Button aria-label="Buat Paket Soal" render={<Link href="/mentor/packages/create" />} size="icon" title="Buat Paket Soal" variant="brand"><Plus /></Button>
      </div>

      <form action="/mentor/packages" role="search">
        {status ? <input name="status" type="hidden" value={status} /> : null}
        {subtest ? <input name="subtest" type="hidden" value={subtest} /> : null}
        <div className="relative w-full">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-secondary-400" />
          <Input defaultValue={query} name="q" aria-label="Cari Paket Soal" className="h-12 w-full rounded-2xl border-primary-200 bg-white pr-4 pl-10 shadow-sm focus-visible:border-primary-500 focus-visible:ring-primary-300/35" placeholder="Cari judul, deskripsi, atau Subtest..." />
          <button className="sr-only" type="submit">Cari Paket Soal</button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <CatalogueFilter
          label="Filter Subtest"
          onValueChange={(value) => router.push(catalogueHref(query, 1, status, value))}
          options={[
            { label: "Semua Subtest", value: "" },
            ...kaptenSubjects.map((subject) => ({ label: `${subject.code} · ${subject.name}`, value: subject.code })),
          ]}
          value={subtest}
        />
        <CatalogueFilter
          label="Filter status"
          onValueChange={(value) => router.push(catalogueHref(query, 1, value, subtest))}
          options={[
            { label: "Semua status", value: "" },
            { label: "Draf", value: "draft" },
            { label: "Siap", value: "ready" },
          ]}
          value={status}
        />
      </div>

      <section aria-label="Daftar Paket Soal" className="grid gap-3">
        {items.length ? items.map((item) => (
          <Link aria-label={`Buka Paket Soal ${item.title}`} className="group grid gap-4 rounded-3xl border border-primary-100 bg-white p-4 shadow-sm transition-[transform,border-color,box-shadow] duration-200 motion-safe:hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-[0_18px_38px_-28px_rgba(1,76,56,0.38)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-700/20 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center" href={`/mentor/packages/${item.id}`} key={item.id}>
            <span className="grid size-10 place-items-center rounded-xl bg-primary-50 text-sm font-bold text-primary-800">{item.subtest}</span>
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-secondary-900">{item.title}</h2>
              {item.description ? <p className="mt-1 line-clamp-1 text-sm text-secondary-500">{item.description}</p> : null}
            </div>
            <ChevronRight aria-hidden className="size-5 text-secondary-400 transition-transform group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5" />
          </Link>
        )) : <div className="rounded-3xl border border-dashed border-primary-200 px-5 py-12 text-center text-sm text-secondary-500"><PackageCheck className="mx-auto mb-3 size-5 text-primary-800" />{query ? "Tidak ada Paket Soal yang cocok dengan pencarian ini." : "Belum ada Paket Soal."}</div>}
      </section>

      {totalItems ? <PaginationLinks nextHref={page < totalPages ? catalogueHref(query, page + 1, status, subtest) : undefined} page={page} pageCount={totalPages} previousHref={page > 1 ? catalogueHref(query, page - 1, status, subtest) : undefined} /> : null}
    </div>
  );
}

export { KaptenPackageCataloguePageModule };

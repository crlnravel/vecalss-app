"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "@/lib/icons";

import { controlSections } from "./catalogue-controls";
import { dashboardSections } from "./catalogue-dashboard";
import { surfaceSections } from "./catalogue-surfaces";
import { TokenCatalogue } from "./catalogue-tokens";
import { primitiveInventory } from "./primitive-inventory";

type CatalogueSection = {
  id: string;
  title: string;
  description: string;
  sources: readonly string[];
  preview: ReactNode;
};

type CatalogueCategory = "all" | "controls" | "surfaces" | "tokens" | "inventory";

const categories: { label: string; value: CatalogueCategory }[] = [
  { label: "Semua komponen", value: "all" },
  { label: "Kontrol", value: "controls" },
  { label: "Tampilan dan interaksi", value: "surfaces" },
  { label: "Token", value: "tokens" },
  { label: "Inventaris sumber", value: "inventory" },
];

const componentSections: CatalogueSection[] = [...controlSections, ...surfaceSections, ...dashboardSections];

function ComponentCatalogue() {
  const [category, setCategory] = useState<CatalogueCategory>("all");
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("id-ID");
  const sections = category === "controls"
    ? controlSections
    : category === "surfaces"
      ? [...surfaceSections, ...dashboardSections]
      : componentSections;
  const matchingSections = sections.filter((section) =>
    [section.title, section.description, ...section.sources].join(" ").toLocaleLowerCase("id-ID").includes(query),
  );

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <div className="flex min-w-0 flex-col gap-5">
        <p className="max-w-[65ch] text-sm leading-6 text-secondary-700">
          Referensi komponen dan token yang dipakai di Vecalss. Coba interaksinya,
          bandingkan variasinya, lalu gunakan sumber yang sama untuk halaman baru.
        </p>
        <div aria-label="Kategori katalog" className="flex flex-wrap gap-2" role="group">
          {categories.map((item) => (
            <Button
              aria-pressed={category === item.value}
              className="min-h-[44px]"
              key={item.value}
              onClick={() => setCategory(item.value)}
              type="button"
              variant={category === item.value ? "secondary" : "ghost"}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      {category === "tokens" ? <TokenCatalogue /> : category === "inventory" ? (
        <section aria-labelledby="catalogue-inventory-title" className="min-w-0">
          <h2 className="text-xl font-semibold text-secondary-900" id="catalogue-inventory-title">Inventaris sumber</h2>
          <p className="mt-2 max-w-[65ch] text-sm leading-6 text-secondary-700">
            {primitiveInventory.length} berkas bersama. Komponen memiliki contoh visual;
            resep varian, token, dan helper mendukung contoh yang terkait.
          </p>
          <ul className="mt-5 divide-y divide-primary-100 border-y border-primary-100">
            {primitiveInventory.map((entry) => {
              const examples = componentSections.filter((section) => section.sources.some((source) => source.split(" — ")[0] === entry.source));
              return (
                <li className="flex min-w-0 flex-col gap-2 py-4 sm:flex-row sm:justify-between" key={entry.source}>
                  <div className="min-w-0">
                    <code className="break-all text-xs text-secondary-900">{entry.source}</code>
                    <p className="mt-1 text-xs text-secondary-600">{entry.kind} · {entry.category}</p>
                  </div>
                  <p className="text-sm text-secondary-700 sm:max-w-[45%] sm:text-right">
                    {examples.length > 0 ? examples.map((section) => section.title).join(", ") : "Sumber pendukung"}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <>
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:max-w-md">
              <label className="mb-2 block text-sm font-semibold text-secondary-900" htmlFor="component-search">
                Cari komponen
              </label>
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-secondary-600" />
                <Input
                  className="pl-10"
                  id="component-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Button, badge, dialog…"
                  type="search"
                  value={search}
                />
              </div>
            </div>
            <p aria-live="polite" className="text-sm text-secondary-600 tabular-nums">
              {matchingSections.length} dari {sections.length} kelompok komponen
            </p>
          </div>

          {matchingSections.length > 0 ? (
            <>
              <nav aria-label="Daftar komponen" className="flex flex-wrap gap-x-5 gap-y-2 border-y border-primary-100 py-4">
                {matchingSections.map((section) => (
                  <a className="inline-flex min-h-[44px] items-center rounded-md text-sm font-medium text-primary-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500" href={`#component-${section.id}`} key={section.id}>
                    {section.title}
                  </a>
                ))}
              </nav>
              <div className="flex min-w-0 flex-col gap-10">
                {matchingSections.map((section) => (
                  <section aria-labelledby={`component-title-${section.id}`} className="min-w-0 scroll-mt-28" id={`component-${section.id}`} key={section.id}>
                    <div className="mb-5 flex min-w-0 flex-col gap-2">
                      <h2 className="text-xl font-semibold text-secondary-900" id={`component-title-${section.id}`}>
                        {section.title}
                      </h2>
                      <p className="max-w-[65ch] text-sm leading-6 text-secondary-700">{section.description}</p>
                      <div aria-label="Sumber komponen" className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-secondary-600">
                        {section.sources.map((source) => <code className="break-all" key={source}>{source}</code>)}
                      </div>
                    </div>
                    <div className="min-w-0 rounded-2xl border border-primary-100 bg-white p-4 sm:p-6" data-catalogue-preview={section.id}>
                      {section.preview}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-start gap-3 border-t border-primary-100 py-8">
              <h2 className="text-base font-semibold text-secondary-900">Komponen tidak ditemukan</h2>
              <p className="text-sm text-secondary-700">Coba nama lain atau cari berdasarkan nama berkas.</p>
              <Button onClick={() => setSearch("")} type="button" variant="outline">Hapus pencarian</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { ComponentCatalogue };
export type { CatalogueSection };

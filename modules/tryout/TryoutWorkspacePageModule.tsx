"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpenText, CalendarDays, ChevronRight, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";

import { tryoutCategories, tryoutSections } from "./data";

const toneStyles = {
  cream: {
    frame:
      "border-[#014c38]/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,248,0.98))]",
    kicker: "bg-[#f5c518]/16 text-[#7a5a00]",
  },
  mint: {
    frame:
      "border-[#014c38]/10 bg-[linear-gradient(180deg,rgba(241,248,244,0.98),rgba(234,244,239,0.98))]",
    kicker: "bg-[#014c38]/10 text-[#014c38]",
  },
  sky: {
    frame:
      "border-[#014c38]/10 bg-[linear-gradient(180deg,rgba(239,248,252,0.98),rgba(245,250,252,0.98))]",
    kicker: "bg-[#6fcfe7]/18 text-[#0f5f72]",
  },
};

function TryoutWorkspacePageModule({ session }: { session: SessionContext }) {
  const featuredTryout = tryoutSections[0]?.tryouts[0];

  return (
    <CourseWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Tryout"
      searchPlaceholder="Cari tryout, periode, atau paket latihan..."
      session={session}
    >
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_320px]">
        <div className="relative overflow-hidden rounded-[32px] border border-primary-100 bg-[linear-gradient(125deg,#ecfbf9_0%,#d8f2e3_52%,#fff1a8_100%)] shadow-[0_28px_90px_-58px_rgba(1,76,56,0.42)]">
          <div className="grid gap-6 p-7 md:p-8 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-end">
            <div>
              <Badge className="rounded-full px-4 py-2 text-[12px] tracking-[0.18em] uppercase" size="card" variant="mint">
                Katalog Tryout
              </Badge>
              <h1 className="mt-5 max-w-[12ch] text-[34px] leading-[1.02] font-semibold text-secondary-900 md:text-[44px]">
                Pilih tryout sesuai ritme dan target ujianmu.
              </h1>
              <p className="mt-4 max-w-[56ch] text-sm leading-7 text-secondary-700 md:text-base">
                Sekarang tryout sudah masuk ke alur yang sama dengan materi dan quiz,
                jadi siswa bisa pindah dari latihan, review, sampai evaluasi tanpa
                terasa pindah produk.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button render={<Link href="#fleksibel" />} size="sm" variant="brand">
                  Buka tryout terbaru
                  <ChevronRight data-icon="inline-end" />
                </Button>
                <Button render={<Link href="/dashboard#progress" />} size="sm" variant="brandOutline">
                  Lihat progres tryout
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-white/60 bg-white/55 p-2 shadow-[0_24px_70px_-46px_rgba(1,76,56,0.38)]">
              <Image
                alt="Featured Vecalss tryout banner"
                className="h-auto w-full rounded-[18px] object-cover"
                height={1080}
                priority
                sizes="(min-width: 1280px) 22vw, (min-width: 768px) 32vw, 100vw"
                src="/brand/tryout-placeholder-banner.jpg"
                width={1920}
              />
            </div>
          </div>
        </div>

        <aside className="grid gap-4">
          <div className="rounded-[28px] border border-primary-100 bg-white p-6 shadow-[0_22px_64px_-48px_rgba(1,76,56,0.24)]">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary-700 uppercase">
              Ringkasan cepat
            </p>
            <div className="mt-5 grid gap-3">
              <SummaryRow label="Paket aktif" value="9 tryout" />
              <SummaryRow label="Periode terbaru" value="Juli 2026" />
              <SummaryRow label="Format populer" value="Fleksibel" />
            </div>
          </div>

          {featuredTryout ? (
            <div className="rounded-[28px] border border-primary-100 bg-white p-6 shadow-[0_22px_64px_-48px_rgba(1,76,56,0.24)]">
              <p className="text-xs font-semibold tracking-[0.16em] text-primary-700 uppercase">
                Rekomendasi hari ini
              </p>
              <h2 className="mt-4 text-xl leading-tight font-semibold text-secondary-900">
                {featuredTryout.title}
              </h2>
              <div className="mt-4 flex flex-wrap gap-3 text-sm text-secondary-600">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="size-4" />
                  {featuredTryout.duration}
                </span>
                <span className="inline-flex items-center gap-2">
                  <BookOpenText className="size-4" />
                  {featuredTryout.questionCount}
                </span>
              </div>
              <Button className="mt-6 w-full" size="sm" variant="brand">
                Mulai dari paket ini
              </Button>
            </div>
          ) : null}
        </aside>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {tryoutCategories.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              className="rounded-[26px] border border-primary-100 bg-white p-5 shadow-[0_18px_52px_-46px_rgba(1,76,56,0.2)] transition-transform duration-300 hover:-translate-y-1"
              href={`#${item.id}`}
              key={item.id}
            >
              <span className="flex size-14 items-center justify-center rounded-[18px] bg-primary-50 text-primary-700">
                <Icon className="size-7" />
              </span>
              <div className="mt-4 flex items-center gap-2">
                <p className="text-lg font-semibold text-secondary-900">{item.label}</p>
                {item.soon ? (
                  <span className="rounded-full bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700">
                    Segera
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-secondary-500">{item.blurb}</p>
            </Link>
          );
        })}
      </section>

      <div className="grid gap-8">
        {tryoutSections.map((section) => (
          <section className="scroll-mt-28" id={section.id} key={section.id}>
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <span
                  className={cn(
                    "inline-flex rounded-full px-3 py-1 text-[12px] font-semibold tracking-[0.12em] uppercase",
                    toneStyles[section.tone].kicker,
                  )}
                >
                  {section.kicker}
                </span>
                <h2 className="mt-3 text-[30px] leading-tight font-semibold text-secondary-900 md:text-[36px]">
                  {section.title}
                </h2>
                <p className="mt-2 max-w-[70ch] text-sm leading-7 text-secondary-500 md:text-base">
                  {section.description}
                </p>
              </div>
              <Button render={<Link href="/dashboard#progress" />} size="sm" variant="ghost">
                Hubungkan ke progres
                <ChevronRight data-icon="inline-end" />
              </Button>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {section.tryouts.map((tryout) => (
                <article
                  className={cn(
                    "overflow-hidden rounded-[28px] border shadow-[0_22px_64px_-48px_rgba(1,76,56,0.22)]",
                    toneStyles[section.tone].frame,
                  )}
                  key={tryout.id}
                >
                  <div className="relative">
                    <Image
                      alt={tryout.title}
                      className="h-[190px] w-full object-cover"
                      height={1080}
                      sizes="(min-width: 1280px) 24vw, (min-width: 768px) 45vw, 100vw"
                      src="/brand/tryout-placeholder-banner.jpg"
                      width={1920}
                    />
                    <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
                      <span className="rounded-full bg-white/92 px-3 py-1 text-[12px] font-semibold text-primary-700">
                        {tryout.badge}
                      </span>
                      <span className="rounded-full bg-secondary-900 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-white uppercase">
                        {tryout.period}
                      </span>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-primary-700">
                        {tryout.indexLabel}
                      </span>
                      <span className="text-xs font-semibold tracking-[0.12em] text-secondary-500 uppercase">
                        {tryout.status}
                      </span>
                    </div>
                    <h3 className="mt-4 text-2xl leading-tight font-semibold text-secondary-900">
                      {tryout.title}
                    </h3>
                    <div className="mt-4 flex flex-wrap gap-4 text-sm text-secondary-500">
                      <span className="inline-flex items-center gap-2">
                        <CalendarDays className="size-4" />
                        {tryout.duration}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <BookOpenText className="size-4" />
                        {tryout.questionCount}
                      </span>
                    </div>
                    <div className="mt-6 flex gap-3">
                      <Button className="flex-1" size="sm" variant="brand">
                        Ambil tryout
                      </Button>
                      <Button size="sm" variant="brandOutline">
                        <Sparkles data-icon="inline-start" />
                        Review
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </CourseWorkspaceShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-primary-50/70 px-4 py-3">
      <span className="text-sm text-secondary-500">{label}</span>
      <span className="text-sm font-semibold text-secondary-900">{value}</span>
    </div>
  );
}

export { TryoutWorkspacePageModule };

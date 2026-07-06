"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HomeFooter } from "@/modules/home/components/home-footer";
import { ActionButtonLink } from "@/modules/home/components/home-primitives";
import { MarketingHeader } from "@/modules/home/components/marketing-header";
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

export default function TryoutPageModule() {
  return (
    <main className="overflow-x-hidden bg-[linear-gradient(180deg,#f9faf5_0%,#f4f0e2_42%,#ffffff_100%)] text-secondary-900">
      <div className="absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(circle_at_top_left,rgba(245,197,24,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(1,76,56,0.12),transparent_38%)]" />
      <div className="mx-auto flex w-full max-w-[1440px] flex-col">
        <MarketingHeader currentPath="/tryout" />

        <section className="px-4 pb-10 md:px-8 lg:px-10 xl:px-[100px]">
          <div className="grid gap-8 border-b border-[#014c38]/10 py-10 md:gap-10 md:py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.82fr)] lg:items-end">
            <div>
              <Badge
                className="rounded-full px-4 py-2 font-display text-xs tracking-[0.22em] uppercase"
                size="card"
                variant="mint"
              >
                Tryout Vecalss
              </Badge>

              <h1 className="mt-7 max-w-[14ch] text-5xl leading-[0.94] font-medium text-black md:text-7xl">
                Siap Hadapi Ujian?
              </h1>

              <p className="mt-5 max-w-[62ch] text-lg leading-8 text-secondary-900/72 md:text-xl">
                Uji kemampuanmu dengan katalog tryout SNBT yang terasa akrab
                dengan referensi, lalu dibawa masuk ke sistem visual Vecalss
                supaya tetap menyatu dengan project ini.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <ActionButtonLink href="#fleksibel">Lihat tryout terbaru</ActionButtonLink>
                <ActionButtonLink href="/login" variant="brandOutline">
                  Masuk dan lanjut latihan
                </ActionButtonLink>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-6xl border border-[#014c38]/12 bg-[#dbe5d6] p-3 shadow-[0_34px_90px_-58px_rgba(1,76,56,0.35)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.62),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(245,197,24,0.18),transparent_24%)]" />
              <div className="relative overflow-hidden rounded-4xl">
                <Image
                  alt="Placeholder banner tryout Vecalss"
                  className="h-auto w-full object-cover"
                  height={1080}
                  priority
                  sizes="(min-width: 1280px) 40vw, (min-width: 768px) 50vw, 100vw"
                  src="/brand/tryout-placeholder-banner.jpg"
                  width={1920}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-end">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {tryoutCategories.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    className="group relative overflow-hidden rounded-5xl border border-[#014c38]/10 bg-white/92 p-5 shadow-[0_22px_58px_-44px_rgba(1,76,56,0.2)] transition-transform duration-300 hover:-translate-y-1"
                    href={`#${item.id}`}
                    key={item.id}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,197,24,0.13),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(1,76,56,0.08),transparent_34%)] opacity-80" />
                    <div className="relative">
                      <span className="flex size-16 items-center justify-center rounded-3xl border border-[#014c38]/10 bg-[linear-gradient(180deg,#f8fbf4,#eef3ea)] text-[#014c38] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                        <Icon className="size-8" />
                      </span>
                      <div className="mt-5 flex items-center gap-2">
                        <h2 className="text-2xl leading-[1.06] font-medium text-black">
                          {item.label}
                        </h2>
                        {item.soon ? (
                          <span className="rounded-full bg-[#dff5c8] px-2.5 py-1 text-xs font-semibold tracking-[0.12em] text-[#5f8a1e] uppercase">
                            Segera
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 max-w-[28ch] text-sm leading-6 text-secondary-900/62">
                        {item.blurb}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>

            <label className="flex flex-col gap-3 xl:items-end">
              <span className="text-sm font-semibold tracking-[0.08em] text-secondary-900/54 uppercase">
                Periode
              </span>
              <div className="relative w-full xl:max-w-[300px]">
                <select
                  className="h-14 w-full appearance-none rounded-3xl border border-[#014c38]/14 bg-white px-5 pr-14 text-lg text-secondary-900 shadow-[0_18px_48px_-40px_rgba(1,76,56,0.26)] outline-none transition-colors focus:border-[#014c38]/28"
                  defaultValue="all"
                >
                  <option value="all">Semua Periode</option>
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                  <option value="archived">Arsip</option>
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-5 -translate-y-1/2 text-secondary-900/48" />
              </div>
            </label>
          </div>
        </section>

        <div className="flex flex-col gap-10 px-4 pb-14 md:px-8 lg:px-10 xl:px-[100px] xl:gap-12">
          {tryoutSections.map((section) => (
            <section className="scroll-mt-28" id={section.id} key={section.id}>
              <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-3 py-1 text-xs font-semibold tracking-[0.12em] uppercase",
                      toneStyles[section.tone].kicker,
                    )}
                  >
                    {section.kicker}
                  </span>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <h2 className="text-5xl leading-none font-medium text-black md:text-6xl">
                      {section.title}
                    </h2>
                    <span className="rounded-full border border-[#49c7c3]/45 bg-[#effdfc] px-3 py-1 text-sm font-semibold text-[#14938d]">
                      Baru
                    </span>
                  </div>
                  <p className="mt-3 max-w-[68ch] text-base leading-7 text-secondary-900/66 md:text-lg">
                    {section.description}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-[#014c38]">
                  <button
                    aria-label={`Scroll ${section.title} left`}
                    className="flex size-11 items-center justify-center rounded-full border border-[#014c38]/12 bg-white shadow-[0_18px_46px_-38px_rgba(1,76,56,0.22)] transition-transform hover:-translate-y-0.5"
                    type="button"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    aria-label={`Scroll ${section.title} right`}
                    className="flex size-11 items-center justify-center rounded-full border border-[#014c38]/12 bg-white shadow-[0_18px_46px_-38px_rgba(1,76,56,0.22)] transition-transform hover:-translate-y-0.5"
                    type="button"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </div>
              </div>

              <div className="mt-6 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4">
                {section.tryouts.map((tryout) => (
                  <article
                    className={cn(
                      "min-w-[320px] snap-start overflow-hidden rounded-5xl border shadow-[0_28px_74px_-48px_rgba(1,76,56,0.22)] md:min-w-[360px] lg:min-w-[372px]",
                      toneStyles[section.tone].frame,
                    )}
                    key={tryout.id}
                  >
                    <div className="relative">
                      <Image
                        alt={tryout.title}
                        className="h-[220px] w-full object-cover object-center"
                        height={1080}
                        sizes="(min-width: 1024px) 28vw, (min-width: 768px) 45vw, 88vw"
                        src="/brand/tryout-placeholder-banner.jpg"
                        width={1920}
                      />
                      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-5">
                        <span className="rounded-full bg-white/92 px-3 py-1 text-sm font-semibold text-[#014c38] shadow-[0_12px_34px_-24px_rgba(1,76,56,0.4)]">
                          {tryout.badge}
                        </span>
                        <span className="rounded-full bg-[#014c38] px-3 py-1 text-xs font-semibold tracking-[0.12em] text-white uppercase">
                          {tryout.period}
                        </span>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(8,14,12,0.74)_100%)] p-5">
                        <span className="inline-flex rounded-full bg-white px-4 py-2 text-base font-semibold text-[#014c38] shadow-[0_12px_30px_-24px_rgba(0,0,0,0.42)]">
                          {tryout.indexLabel}
                        </span>
                      </div>
                    </div>

                    <div className="p-6">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-3 py-1 text-sm font-semibold",
                          tryout.status === "Berlangsung" &&
                            "border border-[#ffb8b0] bg-[#fff0ee] text-[#c23d2f]",
                          tryout.status === "Terbaru" &&
                            "border border-[#49c7c3]/45 bg-[#effdfc] text-[#14938d]",
                          tryout.status === "Review" &&
                            "border border-[#014c38]/16 bg-[#eef7f1] text-[#014c38]",
                          tryout.status === "Arsip" &&
                            "border border-[#10241d]/10 bg-[#f4f5f4] text-[#5c685f]",
                          tryout.status === "Premium" &&
                            "border border-[#f0cb58]/40 bg-[#fff7d6] text-[#8a6500]",
                          tryout.status === "Terjadwal" &&
                            "border border-[#8fc1ff]/38 bg-[#edf6ff] text-[#1e5c9a]",
                          tryout.status === "Selesai" &&
                            "border border-[#d9d5cc] bg-[#fbf8f0] text-[#6d6758]",
                        )}
                      >
                        {tryout.status}
                      </span>

                      <h3 className="mt-5 text-4xl leading-[0.95] font-medium text-black">
                        {tryout.title}
                      </h3>

                      <div className="mt-5 flex flex-wrap gap-4 text-base text-secondary-900/64">
                        <span className="inline-flex items-center gap-2">
                          <CalendarDays className="size-4" />
                          {tryout.duration}
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <BookOpenText className="size-4" />
                          {tryout.questionCount}
                        </span>
                      </div>

                      <Link
                        className={cn(
                          buttonVariants({ variant: "brand", size: "marketing" }),
                          "mt-7 flex w-full justify-center rounded-2xl bg-[#f4d15f] text-[#2a2408] shadow-[0_20px_42px_-26px_rgba(244,209,95,0.9)] hover:bg-[#efc949]",
                        )}
                        href="/login"
                      >
                        Daftar Sekarang
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="px-4 pb-14 md:px-8 lg:px-10 xl:px-[100px]">
          <div className="relative overflow-hidden rounded-6xl border border-[#014c38]/10 bg-[#014c38] px-6 py-8 text-white shadow-[0_32px_80px_-54px_rgba(1,76,56,0.44)] md:px-10 md:py-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(245,197,24,0.2),transparent_22%)]" />
            <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <p className="text-sm font-semibold tracking-[0.18em] text-white/64 uppercase">
                  Next step
                </p>
                <h2 className="mt-4 max-w-[16ch] text-4xl leading-[1.02] font-medium md:text-6xl">
                  Masuk ke dashboard dan lanjutkan latihan yang paling cocok.
                </h2>
                <p className="mt-4 max-w-[54ch] text-lg leading-7 text-white/74">
                  Halaman ini sudah mengikuti komposisi referensi, sementara
                  visual banner tryout masih memakai placeholder Vecalss yang
                  kamu berikan untuk fase sekarang.
                </p>
              </div>

              <ActionButtonLink
                className="w-full bg-white text-[#014c38] hover:bg-white/92 md:w-fit"
                href="/login"
                variant="inverseOutline"
              >
                Masuk ke akun
                <ArrowRight className="size-4" />
              </ActionButtonLink>
            </div>
          </div>
        </section>

        <HomeFooter />
      </div>
    </main>
  );
}

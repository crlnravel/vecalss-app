"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpenText, CalendarDays, ChevronRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";

import { tryoutSections } from "./data";

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
  return (
    <CourseWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Tryout"
      searchPlaceholder="Cari tryout, periode, atau paket latihan..."
      session={session}
    >
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

export { TryoutWorkspacePageModule };

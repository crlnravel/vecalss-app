"use client";

import Image from "next/image";
import { BookOpenText, CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";

import { tryoutSections } from "./data";

const toneStyles = {
  cream: {
    frame:
      "border-[#014c38]/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,248,0.98))]",
  },
  mint: {
    frame:
      "border-[#014c38]/10 bg-[linear-gradient(180deg,rgba(241,248,244,0.98),rgba(234,244,239,0.98))]",
  },
  sky: {
    frame:
      "border-[#014c38]/10 bg-[linear-gradient(180deg,rgba(239,248,252,0.98),rgba(245,250,252,0.98))]",
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
            <div>
              <h2 className="text-4xl leading-tight font-semibold text-secondary-900 md:text-5xl">
                {section.title}
              </h2>
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
                    {tryout.isNew ? (
                      <span className="absolute top-4 right-4 rounded-full bg-[#effdfc] px-3 py-1 text-xs font-semibold tracking-[0.12em] text-[#14938d] uppercase shadow-[0_10px_24px_-16px_rgba(20,147,141,0.65)]">
                        Baru
                      </span>
                    ) : null}
                  </div>
                  <div className="p-5">
                    <h3 className="text-2xl leading-tight font-semibold text-secondary-900">
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
                    <div className="mt-6">
                      <Button className="w-full" size="sm" variant="brand">
                        Ambil tryout
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

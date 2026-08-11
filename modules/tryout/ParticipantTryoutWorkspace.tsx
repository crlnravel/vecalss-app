"use client";

import {
  ArrowRight,
  ArrowCounterClockwise,
  BookOpenText,
  Buildings,
  CalendarBlank,
  Clock,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { studentCatalogueCardVariants } from "@/components/ui/student-catalogue-card";
import { studentBadgeVariants } from "@/components/ui/student-badge";
import type { SessionContext } from "@/lib/auth/types";
import type { ParticipantTryout } from "@/lib/tryout/participant-repository";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";
import { formatDuration, formatSchedule, getTryoutState } from "./ParticipantTryoutWorkspaceUtils";
import type { TryoutState } from "./ParticipantTryoutWorkspaceUtils";

const filters = [
  { id: "all", label: "Semua" },
  { id: "mine", label: "Tryout saya" },
  { id: "finished", label: "Selesai" },
  { id: "practice", label: "Latihan" },
] as const;

type CatalogueFilter = (typeof filters)[number]["id"];
function stateLabel(state: TryoutState) {
  return {
    finished: "Selesai",
    ongoing: "Berlangsung",
    practice: "Latihan",
    upcoming: "Akan datang",
  }[state];
}

function stateClassName(state: TryoutState) {
  return {
    finished: studentBadgeVariants({ tone: "success" }),
    ongoing: studentBadgeVariants({ tone: "active" }),
    practice: studentBadgeVariants({ tone: "info" }),
    upcoming: studentBadgeVariants({ tone: "attention" }),
  }[state];
}

function TryoutCardArtwork({
  useReferenceCover,
}: {
  useReferenceCover: boolean;
}) {
  return (
    <div className="relative aspect-[16/9] overflow-hidden bg-primary-50">
      {useReferenceCover ? (
        <Image
          alt=""
          className="object-cover object-center"
          fill
          sizes="(min-width: 1280px) 50vw, (min-width: 640px) 50vw, 100vw"
          src="/brand/tryout-placeholder-banner.jpg"
        />
      ) : (
        <>
          <div
            aria-hidden="true"
            className="absolute -top-24 -right-16 size-64 rounded-full border-[18px] border-primary-200/55"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(125deg,#d8eedf_0%,#b8ddc5_48%,#7eb697_100%)]"
          />
          <Image
            alt=""
            className="absolute right-[-1.5rem] bottom-[-2.25rem] h-auto w-[45%] max-w-[15rem] object-contain drop-shadow-[0_18px_24px_rgba(1,76,56,0.2)]"
            height={416}
            sizes="(min-width: 1280px) 15rem, 45vw"
            src="/brand/mascot-vecalss.png"
            width={416}
          />
        </>
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(110deg,rgba(1,76,56,0.28)_0%,rgba(1,76,56,0.03)_60%,rgba(1,76,56,0.2)_100%)]" />
      <span className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-primary-800">
        Vecalss
      </span>
    </div>
  );
}

function ParticipantTryoutWorkspace({
  initialTryouts,
  session,
}: {
  initialTryouts: ParticipantTryout[];
  session: SessionContext;
}) {
  const [filter, setFilter] = useState<CatalogueFilter>("all");
  const [query, setQuery] = useState("");
  const [referenceTime, setReferenceTime] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setReferenceTime(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const visibleTryouts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("id-ID");
    return initialTryouts.filter((tryout) => {
      const state = getTryoutState(tryout, referenceTime);
      const matchesFilter = filter === "all"
        || (filter === "mine" && tryout.admissionStatus !== null)
        || filter === state;
      const matchesQuery = !normalized || [tryout.title, tryout.description, tryout.organizer, tryout.examEvent?.name]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase("id-ID").includes(normalized));
      return matchesFilter && matchesQuery;
    });
  }, [filter, initialTryouts, query, referenceTime]);

  const tryoutGridClass = visibleTryouts.length === 1
    ? "grid gap-5 sm:grid-cols-2 xl:grid-cols-2"
    : "grid gap-5 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <CourseWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Tryout"
      mainClassName="gap-8"
      searchPlaceholder="Cari tryout..."
      session={session}
      showSearch={false}
    >
      <section className="relative isolate min-h-[22rem] overflow-hidden rounded-[2rem] bg-[linear-gradient(120deg,#014c38_0%,#176b4d_62%,#2f8a5d_100%)] px-5 py-8 text-white shadow-[0_28px_70px_-42px_rgba(1,76,56,0.72)] sm:px-8 sm:py-10 lg:min-h-[24rem] lg:px-10 lg:py-12">
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 right-[-3rem] size-64 rounded-full border-[18px] border-[#b7ddc3]/15 sm:size-80" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-[40%] min-w-[18rem] lg:block">
          <div className="absolute inset-x-8 bottom-5 z-10 h-12 rounded-full bg-black/20 blur-2xl" />
          <Image
            alt=""
            className="absolute right-[-2.5rem] bottom-[-2.5rem] h-auto w-[20rem] max-w-none object-contain drop-shadow-[0_26px_42px_rgba(0,20,14,0.36)] xl:w-[26rem]"
            height={416}
            sizes="(min-width: 1280px) 416px, 352px"
            src="/brand/mascot-vecalss.png"
            width={416}
          />
        </div>
        <div className="relative max-w-3xl lg:max-w-[60%]">
          <h1 className="max-w-[15ch] font-heading text-4xl leading-[1.02] font-extrabold tracking-[-0.045em] text-balance sm:text-5xl lg:text-6xl">
            Bersiap menghadapi ujian dengan pengalaman yang terasa nyata.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-[#e7f5eb] sm:text-base sm:leading-7">
            Pilih tryout sesuai kebutuhanmu, tetapkan target kampus, lalu mulai mengerjakan. Semua progres akan tersimpan otomatis.
          </p>
        </div>
      </section>

      <section aria-label="Cari dan filter tryout" className="grid gap-6">
        <div className="grid gap-4 rounded-[1.75rem] border border-primary-100 bg-white p-4 shadow-[0_20px_52px_-38px_rgba(1,76,56,0.5)] sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <label className="relative block w-full">
            <span className="sr-only">Cari tryout</span>
            <MagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-secondary-500" />
            <Input
              className="h-12 rounded-2xl border-primary-100 bg-primary-50/60 pl-11 shadow-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari tryout..."
              value={query}
            />
          </label>

          <div aria-label="Filter tryout" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:justify-end" role="group">
            {filters.map((item) => (
              <Button
                aria-pressed={filter === item.id}
                className="shrink-0 rounded-full"
                key={item.id}
                onClick={() => setFilter(item.id)}
                variant={filter === item.id ? "brand" : "context"}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        {visibleTryouts.length ? (
          <div className={tryoutGridClass}>
            {visibleTryouts.map((tryout) => {
              const totalQuestions = tryout.sections.reduce((sum, section) => sum + section.questionCount, 0);
              const totalDuration = tryout.sections.reduce((sum, section) => sum + section.durationSeconds, 0);
              const primarySession = tryout.assignments[0] ?? tryout.sessions[0];
              const attempt = tryout.assignments[0]?.attempt;
              const state = getTryoutState(tryout, referenceTime);
              const href = attempt?.status === "in_progress"
                ? `/tryout/attempt/${attempt.id}`
                : attempt && attempt.status !== "in_progress"
                  ? `/tryout/attempt/${attempt.id}/result`
                  : `/tryout/${tryout.id}`;
              const actionLabel = attempt?.status === "in_progress"
                ? "Lanjutkan"
                : attempt
                  ? "Lihat hasil"
                  : tryout.admissionStatus === "active" && tryout.assignments.length
                    ? "Masuk ruang tunggu"
                    : tryout.admissionStatus === "active"
                      ? "Lihat status"
                    : "Lihat detail";

              return (
                <article
                  className={studentCatalogueCardVariants({ variant: "tryout" })}
                  data-content-variant="tryout"
                  data-slot="student-catalogue-card"
                  key={tryout.id}
                >
                  <TryoutCardArtwork useReferenceCover={visibleTryouts.length === 1} />

                  <div className="flex flex-1 flex-col p-6 md:p-7">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${stateClassName(state)}`}>{stateLabel(state)}</span>
                      <span className="text-xs font-bold tracking-[0.14em] text-secondary-400 uppercase">Tryout</span>
                    </div>
                    <h3 className="mt-4 line-clamp-2 font-heading text-xl leading-tight font-extrabold tracking-[-0.035em] text-secondary-900">{tryout.title}</h3>
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-secondary-600">
                      <span className="flex items-center gap-1.5"><Clock className="size-4 text-primary-700" />{formatDuration(totalDuration)}</span>
                      <span className="flex items-center gap-1.5"><BookOpenText className="size-4 text-primary-700" />{totalQuestions || "—"} soal</span>
                    </div>
                    <p className="mt-3 flex items-start gap-2 text-sm leading-5 text-secondary-500"><CalendarBlank className="mt-0.5 size-4 shrink-0 text-primary-700" />{formatSchedule(primarySession?.availableFrom)}</p>
                    <div className="mt-auto pt-6">
                      <Button className="w-full" render={<Link href={href} />} variant="brand">
                        {actionLabel} <ArrowRight />
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-primary-200 bg-white px-6 py-16 text-center shadow-[0_18px_42px_-34px_rgba(23,107,77,0.38)]">
            <Buildings className="mx-auto text-3xl text-primary-700" />
            <h3 className="mt-4 text-lg font-semibold text-secondary-900">Tidak ada tryout yang cocok</h3>
            <p className="mt-2 text-sm text-secondary-600">Coba pilih kategori atau kata kunci lain.</p>
            {query || filter !== "all" ? (
              <Button
                className="mt-5"
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
                variant="brandOutline"
              >
                <ArrowCounterClockwise /> Reset pencarian
              </Button>
            ) : null}
          </div>
        )}
      </section>
    </CourseWorkspaceShell>
  );
}

export { ParticipantTryoutWorkspace };

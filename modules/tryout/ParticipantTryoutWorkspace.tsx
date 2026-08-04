"use client";

import {
  ArrowRight,
  BookOpenText,
  Buildings,
  CalendarBlank,
  Clock,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    finished: "border-secondary-200 bg-secondary-50 text-secondary-600",
    ongoing: "border-primary-200 bg-primary-50 text-primary-800",
    practice: "border-sky-200 bg-sky-50 text-sky-800",
    upcoming: "border-amber-200 bg-amber-50 text-amber-800",
  }[state];
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
  const [referenceTime] = useState(() => Date.now());

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

  return (
    <CourseWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Tryout"
      mainClassName="gap-8"
      searchPlaceholder="Cari tryout..."
      session={session}
      showSearch={false}
    >
      <section className="relative min-h-[18rem] overflow-hidden rounded-[2rem] border border-primary-100 bg-[linear-gradient(125deg,#ffffff_0%,#eef9f2_48%,#bfe6ce_100%)] px-5 py-7 shadow-[0_28px_90px_-58px_rgba(1,76,56,0.42)] sm:px-8 sm:py-9 lg:px-10">
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] min-w-[20rem] lg:block">
          <div className="absolute inset-x-8 bottom-5 z-10 h-12 rounded-full bg-primary-900/12 blur-2xl" />
          <Image
            alt=""
            className="absolute right-[-2.5rem] bottom-[-2.5rem] h-auto w-[22rem] max-w-none object-contain drop-shadow-[0_26px_42px_rgba(1,76,56,0.18)] xl:w-[26rem]"
            height={416}
            sizes="(min-width: 1280px) 416px, 352px"
            src="/brand/mascot-vecalss.png"
            width={416}
          />
        </div>
        <div className="relative max-w-3xl">
          <h1 className="max-w-[15ch] font-heading text-4xl leading-[1.02] font-semibold tracking-[-0.035em] text-balance text-secondary-900 sm:text-5xl">
            Bersiap menghadapi ujian dengan pengalaman yang terasa nyata.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-secondary-600 sm:text-base sm:leading-7">
            Pilih tryout sesuai kebutuhanmu, tetapkan target kampus, lalu mulai mengerjakan. Semua progres akan tersimpan otomatis.
          </p>
        </div>
      </section>

      <section aria-label="Cari dan filter tryout" className="grid gap-5">
        <label className="relative block w-full">
          <span className="sr-only">Cari tryout</span>
          <MagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-secondary-500" />
          <Input
            className="h-12 rounded-2xl border-primary-100 bg-white pl-11 shadow-[0_16px_40px_-34px_rgba(1,76,56,0.58)]"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari tryout..."
            value={query}
          />
        </label>

        <div aria-label="Filter tryout" className="flex gap-2 overflow-x-auto pb-1" role="group">
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

        {visibleTryouts.length ? (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
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
                  : tryout.admissionStatus === "active"
                    ? "Masuk ruang tunggu"
                    : "Lihat detail";

              return (
                <article className="group flex min-w-0 flex-col overflow-hidden rounded-3xl border border-primary-100 bg-white transition duration-200 hover:-translate-y-1 hover:border-primary-300 hover:shadow-[0_20px_45px_-34px_rgba(1,76,56,0.45)]" key={tryout.id}>
                  <div className="relative aspect-[16/10] overflow-hidden bg-primary-50">
                    <Image
                      alt=""
                      className="object-cover object-center transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                      fill
                      sizes="(min-width: 1536px) 16.67vw, (min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 100vw"
                      src="/brand/tryout-placeholder-banner.jpg"
                    />
                    <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(110deg,rgba(1,76,56,0.28)_0%,rgba(1,76,56,0.03)_60%,rgba(1,76,56,0.2)_100%)]" />
                    <span className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-primary-800">Vecalss</span>
                  </div>

                  <div className="flex flex-1 flex-col p-3.5">
                    <span className={`w-fit rounded-full border px-2.5 py-1 text-[11px] font-semibold ${stateClassName(state)}`}>{stateLabel(state)}</span>
                    <h3 className="mt-3 line-clamp-2 font-heading text-base leading-tight font-semibold tracking-[-0.02em] text-secondary-900">{tryout.title}</h3>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs text-secondary-600">
                      <span className="flex items-center gap-1.5"><Clock className="text-primary-700" />{formatDuration(totalDuration)}</span>
                      <span className="flex items-center gap-1.5"><BookOpenText className="text-primary-700" />{totalQuestions || "—"} soal</span>
                    </div>
                    <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-secondary-500"><CalendarBlank className="mt-0.5 shrink-0 text-primary-700" />{formatSchedule(primarySession?.availableFrom)}</p>
                    <Button className="mt-4 w-full" render={<Link href={href} />} size="sm" variant="brand">
                      {actionLabel} <ArrowRight />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-primary-200 bg-white px-6 py-14 text-center">
            <Buildings className="mx-auto text-3xl text-primary-700" />
            <h3 className="mt-4 text-lg font-semibold text-secondary-900">Tidak ada tryout yang cocok</h3>
            <p className="mt-2 text-sm text-secondary-600">Coba pilih kategori atau kata kunci lain.</p>
          </div>
        )}
      </section>
    </CourseWorkspaceShell>
  );
}

export { ParticipantTryoutWorkspace };

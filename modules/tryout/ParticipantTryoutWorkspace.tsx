"use client";

import {
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
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { studentCatalogueCardVariants } from "@/components/ui/student-catalogue-card-variants";
import type { SessionContext } from "@/lib/auth/types";
import type { ParticipantTryout } from "@/lib/tryout/participant-repository";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";
import {
  canEnterParticipantWaitingRoom,
  formatDuration,
  formatSchedule,
  getTryoutState,
} from "./ParticipantTryoutWorkspaceUtils";

const filters = [
  { id: "all", label: "Semua" },
  { id: "mine", label: "Tryout saya" },
  { id: "finished", label: "Selesai" },
  { id: "practice", label: "Latihan" },
] as const;

type CatalogueFilter = (typeof filters)[number]["id"];

function TryoutCardArtwork() {
  return (
    <div
      aria-hidden="true"
      className="relative aspect-[16/9] overflow-hidden bg-[linear-gradient(180deg,#eef4ee_0%,#3a5e48_100%)]"
    >
      <Image
        alt=""
        className="object-cover object-center mix-blend-multiply saturate-[0.88]"
        fill
        sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
        src="/brand/tryout-placeholder-banner.jpg"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(110deg,rgba(1,76,56,0.2)_0%,rgba(1,76,56,0.03)_58%,rgba(1,76,56,0.22)_100%)]"
      />
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
    const interval = window.setInterval(
      () => setReferenceTime(Date.now()),
      30_000,
    );
    return () => window.clearInterval(interval);
  }, []);

  const visibleTryouts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("id-ID");
    return initialTryouts.filter((tryout) => {
      const state = getTryoutState(tryout, referenceTime);
      const matchesFilter =
        filter === "all" ||
        (filter === "mine" && tryout.admissionStatus !== null) ||
        filter === state;
      const matchesQuery =
        !normalized ||
        [
          tryout.title,
          tryout.description,
          tryout.organizer,
          tryout.examEvent?.name,
        ]
          .filter(Boolean)
          .some((value) =>
            value?.toLocaleLowerCase("id-ID").includes(normalized),
          );
      return matchesFilter && matchesQuery;
    });
  }, [filter, initialTryouts, query, referenceTime]);

  const tryoutGridClass =
    "grid gap-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4";

  return (
    <CourseWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Tryout"
      mainClassName="gap-8"
      searchPlaceholder="Cari tryout..."
      session={session}
      showSearch={false}
    >
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(120deg,#014c38_0%,#176b4d_62%,#2f8a5d_100%)] px-5 py-8 text-white shadow-[0_28px_70px_-42px_rgba(1,76,56,0.72)] sm:px-8 sm:py-10 lg:min-h-[18rem] lg:px-10 lg:py-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 right-[-3rem] size-64 rounded-full border-[18px] border-[#b7ddc3]/15 sm:size-80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[40%] min-w-[18rem] lg:block"
        >
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
            Tryout
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-[#e7f5eb] sm:text-base sm:leading-7">
            Pilih tryout sesuai kebutuhanmu, tetapkan target kampus, lalu mulai
            mengerjakan. Semua progres akan tersimpan otomatis.
          </p>
        </div>
      </section>

      <section aria-label="Cari dan filter tryout" className="grid gap-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
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

          <div
            aria-label="Filter tryout"
            className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:justify-end"
            role="group"
          >
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
              const totalQuestions = tryout.sections.reduce(
                (sum, section) => sum + section.questionCount,
                0,
              );
              const totalDuration = tryout.sections.reduce(
                (sum, section) => sum + section.durationSeconds,
                0,
              );
              const primarySession =
                tryout.assignments[0] ?? tryout.sessions[0];
              const assignment = tryout.assignments[0];
              const hasEnrolledAssignment =
                tryout.admissionStatus === "active" && Boolean(assignment);
              const canEnterWaiting = canEnterParticipantWaitingRoom(tryout);
              const attempt = assignment?.attempt;
              const href = canEnterWaiting
                ? `/tryout/${tryout.id}/waiting`
                : `/tryout/${tryout.id}`;
              const actionLabel = attempt?.status === "in_progress"
                ? "Lanjutkan"
                : attempt
                  ? "Lihat hasil"
                  : canEnterWaiting
                    ? "Mulai"
                    : hasEnrolledAssignment
                      ? "Selesai"
                      : tryout.admissionStatus === "active"
                        ? "Menunggu"
                        : "Daftar";

              return (
                <article
                  className={studentCatalogueCardVariants({ variant: "tryout" })}
                  data-content-variant="tryout"
                  data-slot="student-catalogue-card"
                  key={tryout.id}
                >
                  <TryoutCardArtwork />

                  <div className="relative flex min-h-[16rem] flex-1 flex-col overflow-hidden bg-[#14241d] p-3 sm:p-4 md:p-5">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-[-18%] top-0 h-36 rounded-[50%] bg-[#3a5e48]/55 blur-3xl"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#3a5e48_0%,#244632_22%,#142b20_58%,#091710_100%)]"
                    />
                    <div className="relative z-10 flex min-h-[16rem] flex-1 flex-col">
                      <div>
                        <h3 className="line-clamp-2 font-heading text-xl leading-[1.1] font-extrabold tracking-[-0.03em] text-white">
                          {tryout.title}
                        </h3>
                        <p className="mt-2 line-clamp-3 max-w-[40ch] text-xs leading-5 text-white/75">
                          {tryout.description ??
                            "Simulasi terstruktur untuk mengukur kesiapanmu."}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/15 px-3.5 py-2 text-xs font-medium text-white/85 backdrop-blur-md">
                            <Clock className="size-4" />
                            {formatDuration(totalDuration)}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/15 px-3.5 py-2 text-xs font-medium text-white/85 backdrop-blur-md">
                            <BookOpenText className="size-4" />
                            {totalQuestions || "—"} soal
                          </span>
                        </div>
                        <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-white/65">
                          <CalendarBlank className="mt-0.5 size-4 shrink-0" />
                          {formatSchedule(primarySession?.availableFrom)}
                        </p>
                      </div>
                      <div className="mt-auto pt-3">
                        <Link
                          className={buttonVariants({
                            className:
                              "h-10 w-full rounded-full border-white bg-white text-secondary-900 shadow-[0_12px_26px_-18px_rgba(0,0,0,0.7)] hover:bg-primary-50 hover:text-secondary-900 sm:h-11",
                            size: "default",
                            variant: "brandOutline",
                          })}
                          href={href}
                        >
                          {actionLabel}
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-primary-200 bg-white px-6 py-16 text-center shadow-[0_18px_42px_-34px_rgba(23,107,77,0.38)]">
            <Buildings className="mx-auto text-3xl text-primary-700" />
            <h3 className="mt-4 text-lg font-semibold text-secondary-900">
              Tidak ada tryout yang cocok
            </h3>
            <p className="mt-2 text-sm text-secondary-600">
              Coba pilih kategori atau kata kunci lain.
            </p>
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

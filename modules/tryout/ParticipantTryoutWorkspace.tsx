"use client";

import {
  BookOpenText,
  Buildings,
  CalendarDays,
  Clock,
  RefreshCw,
  Search,
} from "@/lib/icons";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { CompactFilterTabs } from "@/components/ui/compact-filter-tabs";
import { Input } from "@/components/ui/input";
import { ReferenceEmptyState, ReferenceSurface } from "@/components/dashboard";
import { StudentCatalogueCardFrame } from "@/components/ui/student-catalogue-card";
import type { SessionContext } from "@/lib/auth/types";
import { buildStudentTryoutHref, buildStudentTryoutSubrouteHref } from "@/lib/navigation/canonical-context";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import type { StudentBannerContent } from "@/lib/student/banner-content";
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

function TryoutCardArtwork({ bannerUrl }: { bannerUrl: string | null }) {
  return (
    <div
      aria-hidden="true"
      className="relative aspect-[16/9] overflow-hidden border-b border-primary-100 bg-primary-50"
    >
      <Image
        alt=""
        className="object-cover object-center transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
        fill
        sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
        src={bannerUrl ?? "/brand/tryout-placeholder-banner.jpg"}
        unoptimized={Boolean(bannerUrl)}
      />
    </div>
  );
}

function ParticipantTryoutWorkspace({
  banner,
  initialTryouts,
  notificationFeed,
  session,
}: {
  banner: StudentBannerContent;
  initialTryouts: ParticipantTryout[];
  notificationFeed?: StudentNotificationFeed;
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
      notificationFeed={notificationFeed}
      searchPlaceholder="Cari tryout…"
      session={session}
      showSearch={false}
    >
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-learning-hero-bg px-5 py-8 text-learning-hero-fg shadow-[0_26px_80px_-46px_color-mix(in_oklab,var(--voyage-deep)_24%,transparent)] sm:px-8 sm:py-10 lg:min-h-[18rem] lg:px-10 lg:py-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 right-[-3rem] size-64 rounded-full border-[18px] border-voyage-sea-glass/20 sm:size-80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[40%] min-w-[18rem] lg:block"
        >
          <div className="absolute inset-x-8 bottom-5 z-10 h-12 rounded-full bg-black/20 blur-2xl" />
          <Image
            alt=""
            className="absolute right-[-2.5rem] bottom-[-2.5rem] h-auto w-[20rem] max-w-none object-contain drop-shadow-[0_26px_42px_color-mix(in_oklab,var(--voyage-deep)_36%,transparent)] xl:w-[26rem]"
            height={416}
            sizes="(min-width: 1280px) 416px, 352px"
            src="/brand/mascot-vecalss.png"
            width={416}
          />
        </div>
        <div className="relative max-w-3xl lg:max-w-[60%]">
          <h1 className="max-w-[15ch] font-display text-4xl leading-[1.05] font-extrabold tracking-[-0.04em] text-balance sm:text-5xl">
            {banner.title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-learning-hero-muted sm:text-base sm:leading-7">
            {banner.description}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="inline-flex min-h-10 items-center gap-2 rounded-full bg-student-status-attention-solid-bg px-4 text-sm font-bold tabular-nums text-student-status-attention-solid-fg">
              <CalendarDays aria-hidden="true" className="size-4" />
              {initialTryouts.length} tryout tersedia
            </span>
          </div>
        </div>
      </section>

      <section aria-label="Cari dan filter tryout" className="grid gap-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <label className="relative block w-full">
            <span className="sr-only">Cari tryout</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-secondary-500" />
            <Input
              className="h-12 rounded-2xl border-primary-100 bg-primary-50/60 pl-11 shadow-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari tryout…"
              value={query}
            />
          </label>

          <CompactFilterTabs
            aria-label="Filter tryout"
            className="lg:ml-auto"
            items={filters.map((item) => ({
              label: item.label,
              value: item.id,
            }))}
            onValueChange={setFilter}
            value={filter}
          />
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
                ? buildStudentTryoutSubrouteHref(tryout.id, "waiting", { session: primarySession?.id })
                : buildStudentTryoutHref(tryout.id, { session: primarySession?.id });
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
                <StudentCatalogueCardFrame key={tryout.id} variant="tryout">
                  <TryoutCardArtwork bannerUrl={tryout.bannerUrl} />

                  <div className="flex min-h-[16rem] flex-1 flex-col p-4 sm:p-5">
                    <div>
                      <h3 className="line-clamp-2 font-heading text-xl leading-[1.2] font-extrabold tracking-[-0.03em] text-secondary-900">
                        {tryout.title}
                      </h3>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-secondary-600">
                        {tryout.description ??
                          "Simulasi terstruktur untuk mengukur kesiapanmu."}
                      </p>
                      <div className="mt-3.5 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50/60 px-3 py-1.5 text-xs font-semibold text-primary-800">
                          <Clock className="size-3.5 text-primary-600" />
                          {formatDuration(totalDuration)}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50/60 px-3 py-1.5 text-xs font-semibold text-primary-800">
                          <BookOpenText className="size-3.5 text-primary-600" />
                          {totalQuestions || "—"} soal
                        </span>
                      </div>
                      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-secondary-600">
                        <CalendarDays className="mt-0.5 size-4 shrink-0 text-secondary-400" />
                        {formatSchedule(primarySession?.availableFrom)}
                      </p>
                    </div>
                    <div className="mt-auto pt-4">
                      <Link
                        className={buttonVariants({
                          className:
                            "h-10 w-full rounded-full shadow-[0_12px_24px_-16px_color-mix(in_oklab,var(--voyage-deep)_35%,transparent)] sm:h-11",
                          size: "default",
                          variant: "brand",
                        })}
                        href={href}
                      >
                        {actionLabel}
                      </Link>
                    </div>
                  </div>
                </StudentCatalogueCardFrame>
              );
            })}
          </div>
        ) : (
          <ReferenceSurface className="overflow-hidden">
            <ReferenceEmptyState
              description="Coba pilih kategori atau kata kunci lain."
              icon={Buildings}
              title="Tidak ada tryout yang cocok"
              action={
                query || filter !== "all" ? (
                  <Button
                    onClick={() => {
                      setFilter("all");
                      setQuery("");
                    }}
                    variant="brandOutline"
                  >
                    <RefreshCw /> Reset pencarian
                  </Button>
                ) : undefined
              }
            />
          </ReferenceSurface>
        )}
      </section>
    </CourseWorkspaceShell>
  );
}

export { ParticipantTryoutWorkspace };

"use client";

import Image from "next/image";

import {
  Brain,
  BookOpen,
  Calculator,
  CheckCircle2,
  ChevronRight,
  FileText,
  Languages,
  LibraryBig,
  PenTool,
  type AppIcon,
} from "@/lib/icons";
import { ReferenceEmptyState } from "@/components/dashboard";
import { REFERENCE_SURFACE_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { StudentCatalogueCard } from "@/components/ui/student-catalogue-card";

import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import {
  getStudentBannerDescription,
  getStudentBannerHeading,
  type StudentBannerPresentation,
} from "@/lib/student/banner-presentation";
import { resolveStudentBannerText, type StudentBannerVariables } from "@/lib/student/banner-content";
import { StudentBannerArtwork } from "@/modules/student/components/student-banner-artwork";

import { CourseWorkspaceShell } from "./CourseWorkspaceShell";
import {
  getCourseProgressState,
  type Course,
  type CourseProgressSnapshot,
  type SubjectIcon,
} from "./data";
import { useCourseProgress } from "./progress-storage";
import { cn } from "@/lib/utils";

const courseIcons = {
  brain: Brain,
  calculator: Calculator,
  "file-text": FileText,
  languages: Languages,
  library: LibraryBig,
  "pen-tool": PenTool,
} satisfies Record<SubjectIcon, AppIcon>;

const courseCategoryLabel = "TPA";

function CourseCataloguePageModule({
  banner,
  bannerVariables,
  courses,
  notificationFeed,
  progress,
  session,
}: {
  banner: StudentBannerPresentation;
  bannerVariables: StudentBannerVariables;
  courses: Course[];
  notificationFeed?: StudentNotificationFeed;
  progress: Record<string, CourseProgressSnapshot>;
  session: SessionContext;
}) {
  return (
    <CourseWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel="Materi"
      notificationFeed={notificationFeed}
      showSearch={false}
      session={session}
    >
      <section className="mx-auto flex w-full max-w-[78rem] flex-col gap-8">
        <header className="relative isolate overflow-hidden rounded-[2rem] bg-learning-hero-bg px-6 py-8 text-learning-hero-fg shadow-[0_26px_80px_-46px_color-mix(in_oklab,var(--voyage-deep)_24%,transparent)] md:px-10 md:py-10">
          {banner.design ? (
            <>
              <StudentBannerArtwork banner={banner} className="absolute inset-0 size-full rounded-none" variables={bannerVariables} />
              <div className="sr-only">
                <h1>{getStudentBannerHeading(banner, bannerVariables)}</h1>
                <p>{getStudentBannerDescription(banner, bannerVariables)}</p>
              </div>
            </>
          ) : (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-6 hidden w-52 lg:block xl:right-10"
              >
                <div className="absolute right-0 top-7 size-44 rounded-full border border-voyage-sea-glass/40" />
                <div className="absolute right-4 top-11 size-36 rounded-full bg-voyage-sea-glass" />
                <div className="absolute right-1 top-7 size-8 rounded-full bg-voyage-warm-sun" />
                <Image
                  alt=""
                  className="absolute right-[-2rem] bottom-0 h-auto w-72 max-w-none object-contain"
                  height={162}
                  sizes="288px"
                  src="/brand/voyage-assets/perahu.png"
                  width={288}
                />
              </div>
              <div className="relative lg:pr-60">
                <h1 className="font-display text-4xl leading-tight font-extrabold tracking-[-0.04em] text-balance md:text-5xl">
                  {resolveStudentBannerText(banner.fallback.title, bannerVariables)}
                </h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-learning-hero-muted">
                  {resolveStudentBannerText(banner.fallback.description, bannerVariables)}
                </p>
              </div>
            </>
          )}
        </header>

        {courses.length > 0 ? (
          <section
            aria-labelledby="course-list-title"
            className="flex flex-col gap-4"
          >
            <div className="flex items-center gap-4 px-1">
              <h2
                className="shrink-0 text-lg font-extrabold tracking-[-0.025em] text-[var(--voyage-ink)] md:text-xl"
                id="course-list-title"
              >
                Subtes
              </h2>
              <span className="grid min-w-9 place-items-center rounded-xl bg-voyage-sea-glass px-2 py-1.5 text-sm font-bold tabular-nums text-voyage-deep">{courses.length}<span className="sr-only"> subtes tersedia</span></span>
              <span aria-hidden="true" className="h-px flex-1 bg-learning-card-border" />
            </div>

            <div className="flex flex-col gap-4">
              {courses.map((course) => (
                <CourseRowCard
                  course={course}
                  courses={courses}
                  serverProgress={progress[course.slug]}
                  serverIdentity={session.user.id}
                  key={course.slug}
                />
              ))}
            </div>
          </section>
        ) : (
          <ReferenceEmptyState
            className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "overflow-hidden")}
            description="Bacaan yang tersedia akan muncul di sini."
            icon={BookOpen}
            title="Belum ada bacaan terbit"
          />
        )}
      </section>
    </CourseWorkspaceShell>
  );
}

function CourseRowCard({
  course,
  courses,
  serverIdentity,
  serverProgress,
}: {
  course: Course;
  courses: Course[];
  serverIdentity: string;
  serverProgress?: CourseProgressSnapshot;
}) {
  const progress = useCourseProgress(
    course,
    courses,
    serverProgress,
    serverIdentity,
  );
  const state = getCourseProgressState(course, {
    completedLessonIds: progress.completedLessonIds,
    skippedToLessonId: progress.skippedToLessonId,
  });
  const Icon = courseIcons[course.icon];
  return (
    <StudentCatalogueCard
      className="border-learning-card-border bg-voyage-surface bg-none hover:border-voyage-forest focus-visible:ring-primary-500 focus-visible:ring-offset-2"
      href={`/courses/${course.slug}`}
      variant="materi"
    >
      <span className="relative grid size-14 shrink-0 place-items-center rounded-[1.25rem] bg-learning-hero-bg text-learning-hero-fg md:size-20 md:rounded-[1.6rem]">
        <Icon aria-hidden="true" className="size-7 md:size-9" strokeWidth={2.2} />
        {state.completionPercentage === 100 ? (
          <span className="absolute -right-2 -bottom-2 grid size-7 place-items-center rounded-full bg-student-status-attention-solid-bg text-student-status-attention-solid-fg ring-4 ring-voyage-surface">
            <CheckCircle2 aria-hidden="true" className="size-5" />
          </span>
        ) : null}
      </span>

      <div className="mt-4 min-w-0 md:mt-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold tracking-[0.14em] text-learning-muted-ink uppercase">
            {courseCategoryLabel}
          </span>
          <span className="size-1 rounded-full bg-[var(--primary-300)]" />
          <span className="text-xs font-extrabold tracking-[0.14em] text-learning-muted-ink uppercase">
            {course.code}
          </span>
        </div>
        <h3 className="mt-2 text-xl leading-tight font-extrabold tracking-[-0.035em] text-balance text-voyage-ink md:text-2xl">
          {course.description}
        </h3>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-learning-muted-ink">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen aria-hidden="true" className="size-4" /> {course.lessons.length} unit
          </span>
          <span className="inline-flex items-center gap-1.5 font-bold tabular-nums text-voyage-deep">
            <CheckCircle2 aria-hidden="true" className="size-4" /> {state.completionPercentage}% selesai
          </span>
        </div>

        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-learning-progress-track">
          <div
            aria-hidden="true"
            className="h-full rounded-full bg-learning-progress-fill transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${state.completionPercentage}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end border-t border-learning-card-border pt-4 md:mt-0 md:border-t-0 md:pt-0">
        <span className="grid size-11 place-items-center rounded-full bg-voyage-sea-glass text-voyage-deep transition-colors group-hover:bg-voyage-deep group-hover:text-voyage-surface group-focus-visible:bg-voyage-deep group-focus-visible:text-voyage-surface motion-reduce:transition-none">
          <ChevronRight aria-hidden="true" className="size-5" strokeWidth={2.6} />
        </span>
      </div>
    </StudentCatalogueCard>
  );
}

export { CourseCataloguePageModule };

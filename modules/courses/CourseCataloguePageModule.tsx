"use client";

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
import type { StudentBannerContent } from "@/lib/student/banner-content";

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
  courses,
  notificationFeed,
  progress,
  session,
}: {
  banner: StudentBannerContent;
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
        <header className="relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(120deg,var(--voyage-deep)_0%,var(--voyage-forest)_58%,var(--voyage-leaf)_100%)] px-6 py-7 text-white shadow-[0_28px_60px_-38px_color-mix(in_oklab,var(--voyage-deep)_70%,transparent)] md:px-10 md:py-9">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 right-[-3rem] size-56 rounded-full border-[18px] border-[var(--voyage-sea-glass)]/15 sm:size-72"
          />
          <div className="relative max-w-2xl">
            <h1 className="text-4xl leading-tight font-extrabold tracking-[-0.045em] md:text-5xl">
              {banner.title}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--primary-50)] md:text-base">
              {banner.description}
            </p>
          </div>
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
              <span aria-hidden="true" className="h-px flex-1 bg-[var(--voyage-soft-border)]" />
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
    <StudentCatalogueCard href={`/courses/${course.slug}`} variant="materi">
      <span className="grid size-14 shrink-0 place-items-center rounded-[1.25rem] bg-[linear-gradient(135deg,var(--voyage-sea-glass)_0%,var(--voyage-sea-glass-wash)_100%)] text-[var(--voyage-forest)] shadow-[inset_0_-2px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)] md:size-20 md:rounded-[1.6rem]">
        <Icon className="size-7 md:size-9" strokeWidth={2.2} />
      </span>

      <div className="mt-4 min-w-0 md:mt-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold tracking-[0.14em] text-[var(--voyage-muted-ink)] uppercase">
            {courseCategoryLabel}
          </span>
          <span className="size-1 rounded-full bg-[var(--primary-300)]" />
          <span className="text-xs font-extrabold tracking-[0.14em] text-[var(--voyage-muted-ink)] uppercase">
            {course.code}
          </span>
        </div>
        <h2 className="mt-2 text-xl leading-tight font-extrabold tracking-[-0.035em] text-balance md:text-2xl">
          {course.description}
        </h2>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-[var(--voyage-muted-ink)] sm:text-sm">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="size-4" /> {course.lessons.length} unit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-4" /> {state.completionPercentage}%
          </span>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--secondary-200)]">
          <div
            aria-hidden="true"
            className="h-full rounded-full bg-[linear-gradient(90deg,var(--voyage-forest)_0%,var(--primary-400)_100%)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${state.completionPercentage}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end border-t border-[var(--secondary-200)] pt-4 md:mt-0 md:border-t-0 md:pt-0">
        <span className="grid size-11 place-items-center rounded-full bg-[var(--voyage-forest)] text-white shadow-[0_10px_24px_-16px_color-mix(in_oklab,var(--voyage-forest)_75%,transparent)]">
          <ChevronRight className="size-5" strokeWidth={2.6} />
        </span>
      </div>
    </StudentCatalogueCard>
  );
}

export { CourseCataloguePageModule };

"use client";

import Link from "next/link";
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
  type LucideIcon,
} from "lucide-react";

import type { SessionContext } from "@/lib/auth/types";

import { CourseWorkspaceShell } from "./CourseWorkspaceShell";
import {
  getCourseProgressState,
  type Course,
  type CourseProgressSnapshot,
  type SubjectIcon,
} from "./data";
import { useCourseProgress } from "./progress-storage";

const courseIcons = {
  brain: Brain,
  calculator: Calculator,
  "file-text": FileText,
  languages: Languages,
  library: LibraryBig,
  "pen-tool": PenTool,
} satisfies Record<SubjectIcon, LucideIcon>;

const courseCategoryLabels: Record<string, string> = {
  PU: "TPS",
  PPU: "TPA",
};

function CourseCataloguePageModule({
  courses,
  progress,
  session,
}: {
  courses: Course[];
  progress: Record<string, CourseProgressSnapshot>;
  session: SessionContext;
}) {
  return (
    <CourseWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel="Materi"
      showSearch={false}
      session={session}
    >
      <section className="mx-auto flex w-full max-w-[78rem] flex-col gap-8">
        <header className="relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(120deg,#014c38_0%,#176b4d_58%,#2f8a5d_100%)] px-6 py-7 text-white shadow-[0_28px_60px_-38px_rgba(1,76,56,0.7)] md:px-10 md:py-9">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 right-[-3rem] size-56 rounded-full border-[18px] border-[#b7ddc3]/15 sm:size-72"
          />
          <div className="relative max-w-2xl">
            <h1 className="text-4xl leading-tight font-extrabold tracking-[-0.045em] md:text-5xl">
              Materi
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-[#e7f5eb] md:text-base">
              Pilih subtes yang ingin dipelajari, lalu ikuti jalur materi secara
              berurutan sampai selesai.
            </p>
          </div>
        </header>

        {courses.length > 0 ? (
          <section aria-labelledby="course-list-title" className="flex flex-col gap-4">
            <div className="flex items-center gap-4 px-1">
              <h2
                className="shrink-0 text-lg font-extrabold tracking-[-0.025em] text-[#173c2d] md:text-xl"
                id="course-list-title"
              >
                Pilih subtes
              </h2>
              <span aria-hidden="true" className="h-px flex-1 bg-[#d6e5db]" />
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
          <div className="rounded-[2rem] border border-[#d6e5db] bg-white px-6 py-12 text-center shadow-[0_24px_50px_-42px_rgba(23,107,77,0.45)]">
            <p className="text-base font-extrabold text-[#173c2d]">
              Belum ada bacaan terbit
            </p>
            <p className="mt-2 text-sm text-[#5f776a]">
              Bacaan yang tersedia akan muncul di sini.
            </p>
          </div>
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
  const progress = useCourseProgress(course, courses, serverProgress, serverIdentity);
  const state = getCourseProgressState(course, {
    completedLessonIds: progress.completedLessonIds,
    skippedToLessonId: progress.skippedToLessonId,
  });
  const Icon = courseIcons[course.icon];
  return (
    <Link
      className="group relative grid min-h-[10.5rem] overflow-hidden rounded-[1.75rem] border border-[#c8dfd0] bg-[linear-gradient(110deg,#ffffff_0%,#ffffff_68%,#f1faf4_100%)] p-5 text-[#173c2d] shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)] outline-none transition-transform duration-300 ease-out motion-safe:hover:-translate-y-1 focus-visible:ring-4 focus-visible:ring-[#2f8a5d]/25 motion-reduce:transition-none md:grid-cols-[5rem_minmax(0,1fr)_3rem] md:items-center md:gap-7 md:rounded-[2rem] md:p-7"
      href={`/courses/${course.slug}`}
    >
      <span className="grid size-14 shrink-0 place-items-center rounded-[1.25rem] bg-[linear-gradient(135deg,#b7ddc3_0%,#eef8f1_100%)] text-[#176b4d] shadow-[inset_0_-2px_0_rgba(1,76,56,0.08)] transition-transform duration-250 ease-out motion-safe:group-hover:-rotate-3 motion-reduce:transition-none md:size-20 md:rounded-[1.6rem]">
        <Icon className="size-7 md:size-9" strokeWidth={2.2} />
      </span>

      <div className="mt-4 min-w-0 md:mt-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold tracking-[0.14em] text-[#477060] uppercase">
            {courseCategoryLabels[course.code] ?? course.code}
          </span>
          {!courseCategoryLabels[course.code] ? (
            <>
              <span className="size-1 rounded-full bg-[#9dcab0]" />
              <span className="text-xs font-semibold text-[#718077]">
                {course.difficulty}
              </span>
            </>
          ) : null}
        </div>
        <h2 className="mt-2 text-xl leading-tight font-extrabold tracking-[-0.035em] text-balance md:text-2xl">
          {course.description}
        </h2>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-[#5f776a] sm:text-sm">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="size-4" /> {course.lessons.length} unit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-4" /> {state.completionPercentage}%
          </span>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e2ece5]">
          <div
            aria-hidden="true"
            className="h-full rounded-full bg-[linear-gradient(90deg,#176b4d_0%,#41997d_100%)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${state.completionPercentage}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end border-t border-[#e2ece5] pt-4 md:mt-0 md:border-t-0 md:pt-0">
        <span className="grid size-11 place-items-center rounded-full bg-[#176b4d] text-white shadow-[0_10px_24px_-16px_rgba(23,107,77,0.75)] transition-transform duration-200 ease-out motion-safe:group-hover:translate-x-0.5 motion-reduce:transition-none">
          <ChevronRight className="size-5" strokeWidth={2.6} />
        </span>
      </div>
    </Link>
  );
}

export { CourseCataloguePageModule };

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
  Video,
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
      <section className="mx-auto flex w-full max-w-[78rem] flex-col gap-7">
        <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-4xl leading-tight font-extrabold tracking-[-0.045em] text-[#173c2d] md:text-5xl">
              Materi
            </h1>
            <p className="mt-3 text-sm leading-7 text-[#5f776a] md:text-base">
              Pilih subtes yang ingin dipelajari, lalu ikuti jalur materi secara
              berurutan sampai selesai.
            </p>
          </div>
        </header>

        {courses.length > 0 ? (
          <div className="flex flex-col gap-5">
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
      className="group relative grid min-h-[11rem] overflow-hidden rounded-[2rem] border border-[#c8dfd0] bg-white p-5 text-[#173c2d] shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)] outline-none transition-transform duration-300 ease-out motion-safe:hover:-translate-y-1 focus-visible:ring-4 focus-visible:ring-[#2f8a5d]/25 motion-reduce:transition-none md:grid-cols-[5rem_minmax(0,1fr)_auto] md:items-center md:gap-6 md:p-7"
      href={`/courses/${course.slug}`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1.5 bg-[#176b4d]"
      />

      <div className="flex items-start justify-between gap-4 md:contents">
        <span className="grid size-14 shrink-0 place-items-center rounded-[1.25rem] bg-[linear-gradient(135deg,#b7ddc3_0%,#eef8f1_100%)] text-[#176b4d] transition-transform duration-250 ease-out motion-safe:group-hover:-rotate-3 motion-reduce:transition-none md:size-20 md:rounded-[1.6rem]">
          <Icon className="size-7 md:size-9" strokeWidth={2.2} />
        </span>
      </div>

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
        <h2 className="mt-2 text-xl leading-tight font-extrabold tracking-[-0.035em] text-balance md:text-2xl lg:text-[1.7rem]">
          {course.description}
        </h2>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-[#5f776a] sm:text-sm">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="size-4" /> {course.lessons.length} bacaan
          </span>
          {course.lessons.some((lesson) => lesson.optionalVideo) ? (
            <span className="inline-flex items-center gap-1.5">
              <Video className="size-4" /> video opsional
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-4" /> {state.completionPercentage}%
          </span>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#e2ece5]">
          <div
            aria-hidden="true"
            className="h-full rounded-full bg-[#176b4d] transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${state.completionPercentage}%` }}
          />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 border-t border-[#e2ece5] pt-4 md:mt-8 md:min-w-44 md:flex-col md:items-end md:border-t-0 md:pt-0">
        <span className="grid size-11 place-items-center rounded-full bg-[#176b4d] text-white shadow-[0_10px_24px_-16px_rgba(23,107,77,0.75)]">
          <ChevronRight className="size-5" strokeWidth={2.6} />
        </span>
      </div>
    </Link>
  );
}

export { CourseCataloguePageModule };

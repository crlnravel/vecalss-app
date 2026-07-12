"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Clock3,
  Lock,
  Play,
  RotateCcw,
  SkipForward,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

import { CourseWorkspaceShell } from "./CourseWorkspaceShell";
import {
  courseCatalogue,
  getCourseBySlug,
  getCourseProgressState,
  getLessonProgressStatus,
  type Course,
  type CourseLesson,
  type LessonProgressStatus,
} from "./data";
import { skipToCourseLesson, useCourseProgress } from "./progress-storage";

function CourseLearningPathPageModule({
  courseSlug,
  session,
}: {
  courseSlug: string;
  session: SessionContext;
}) {
  const course = getCourseBySlug(courseSlug) ?? courseCatalogue[0];
  const router = useRouter();

  const progress = useCourseProgress(course);
  const state = getCourseProgressState(course, {
    completedLessonIds: progress.completedLessonIds,
    skippedToLessonId: progress.skippedToLessonId,
  });

  function handleSubjectChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextSlug = event.target.value;
    if (nextSlug !== course.slug) {
      router.push(`/courses/${nextSlug}`);
    }
  }

  function handleSkip(lesson: CourseLesson) {
    skipToCourseLesson(course.slug, lesson.id);
  }

  return (
    <CourseWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel={course.title}
      searchPlaceholder="Cari video di materi ini..."
      session={session}
    >
      <div className="pb-32 pt-8 md:pt-12">
        <SubjectSelector course={course} onChange={handleSubjectChange} />

        <section
          aria-label={`Jalur belajar ${course.title}`}
          className="relative px-3 sm:px-5 md:px-10"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-[2.375rem] z-0 w-[3px] bg-primary-300 sm:left-[3.25rem] md:left-1/2 md:-translate-x-1/2"
          />
          <ol className="relative m-0 list-none space-y-8 p-0 md:space-y-12">
            {state.lessons.map((lesson, index) => {
              const status = getLessonProgressStatus(course, lesson.id, {
                completedLessonIds: progress.completedLessonIds,
                skippedToLessonId: progress.skippedToLessonId,
              });
              return (
                <PathNode
                  course={course}
                  index={index}
                  key={lesson.id}
                  lesson={lesson}
                  onSkip={() => handleSkip(lesson)}
                  status={status}
                />
              );
            })}
          </ol>
        </section>

        <StartLessonPrompt course={course} lesson={state.nextLesson} />
      </div>
    </CourseWorkspaceShell>
  );
}

function SubjectSelector({
  course,
  onChange,
}: {
  course: Course;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <div className="fixed top-20 right-4 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-full border border-primary-100 bg-white/95 p-1.5 shadow-[0_18px_42px_-28px_rgba(10,77,59,0.55)] backdrop-blur md:right-8">
      <label className="sr-only" htmlFor="subject-selector">
        Pilih subjek materi
      </label>
      <div className="relative">
        <select
          aria-label="Pilih subjek materi"
          className="h-11 w-full appearance-none rounded-full border-0 bg-transparent px-4 pr-10 text-sm font-semibold text-secondary-900 outline-none transition focus-visible:ring-3 focus-visible:ring-primary-500/25"
          id="subject-selector"
          onChange={onChange}
          value={course.slug}
        >
          {courseCatalogue.map((subject) => (
            <option key={subject.slug} value={subject.slug}>
              {subject.title} · {subject.description}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-primary-700"
        />
      </div>
    </div>
  );
}

function PathNode({
  course,
  index,
  lesson,
  onSkip,
  status,
}: {
  course: Course;
  index: number;
  lesson: CourseLesson;
  onSkip: () => void;
  status: LessonProgressStatus | undefined;
}) {
  const isCompleted = status === "completed";
  const isActive = status === "active";
  const isAvailable = status === "available";
  const isLocked = status === "locked";
  const href = `/courses/${course.slug}/${lesson.id}`;

  return (
    <li
      className={cn(
        "relative grid grid-cols-[3.25rem_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-4 md:grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] md:gap-0",
        index % 2 === 0
          ? "md:[&>div:last-child]:col-start-3"
          : "md:[&>div:last-child]:col-start-1 md:[&>div:last-child]:row-start-1",
      )}
    >
      <div className="relative z-10 flex justify-center md:col-start-2 md:row-start-1 md:pt-5">
        {isActive ? (
          <span
            className="relative flex h-16 w-24 items-center justify-center"
            role="img"
            aria-label="Posisi belajar saat ini"
          >
            <Image
              alt=""
              className="object-contain drop-shadow-[0_12px_16px_rgba(88,57,21,0.25)]"
              fill
              sizes="96px"
              src="/brand/voyage-assets/perahu.png"
            />
          </span>
        ) : (
          <span
            className={cn(
              "grid size-11 place-items-center rounded-full border-4 border-white text-sm font-bold shadow-[0_12px_22px_-15px_rgba(10,77,59,0.75)] transition-colors sm:size-12",
              isCompleted && "bg-primary-700 text-white",
              isAvailable &&
                "bg-white text-primary-800 ring-8 ring-primary-100",
              isLocked && "bg-secondary-100 text-secondary-400",
            )}
          >
            {isCompleted ? (
              <Check className="size-5" strokeWidth={3} />
            ) : isLocked ? (
              <Lock className="size-4" />
            ) : (
              index + 1
            )}
          </span>
        )}
      </div>

      <div
        className={cn(
          "min-w-0 rounded-3xl border bg-white p-4 shadow-[0_18px_40px_-32px_rgba(10,77,59,0.7)] transition-[transform,box-shadow,border-color] duration-300 motion-reduce:transition-none sm:p-5 md:max-w-[30rem]",
          isActive &&
            "border-accent-300 shadow-[0_25px_60px_-32px_rgba(243,184,75,0.65)]",
          isAvailable && "border-primary-200",
          isCompleted && "border-primary-100",
          isLocked && "border-secondary-100 bg-secondary-50/75",
          index % 2 === 0 ? "md:justify-self-start" : "md:justify-self-end",
          (isActive || isAvailable) &&
            "motion-safe:hover:-translate-y-0.5 hover:shadow-[0_25px_55px_-35px_rgba(10,77,59,0.6)]",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em]",
              isCompleted && "bg-primary-50 text-primary-800",
              isActive && "bg-accent-100 text-secondary-900",
              isAvailable && "bg-primary-50 text-primary-800",
              isLocked && "bg-secondary-100 text-secondary-500",
            )}
          >
            {isCompleted
              ? "Selesai"
              : isActive
                ? "Sedang aktif"
                : isAvailable
                  ? "Siap dimulai"
                  : "Terkunci"}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-secondary-400">
            <Clock3 className="size-3.5" /> {lesson.duration}
          </span>
        </div>
        <p className="mt-3 text-xs font-semibold text-secondary-400">
          Bagian {lesson.sectionIndex + 1} · {lesson.sectionTitle}
        </p>
        <h3
          className={cn(
            "mt-1.5 text-lg leading-snug font-semibold tracking-[-0.025em] sm:text-xl",
            isLocked ? "text-secondary-600" : "text-secondary-950",
          )}
        >
          {lesson.title}
        </h3>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {isLocked ? (
            <Button
              className="h-9 rounded-lg px-3 text-xs"
              onClick={onSkip}
              size="sm"
              type="button"
              variant="outline"
            >
              <SkipForward data-icon="inline-start" />
              Skip ke sini
            </Button>
          ) : (
            <Link
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition focus-visible:ring-3 focus-visible:ring-primary-500/25 focus-visible:outline-none",
                isActive
                  ? "bg-primary-700 text-white hover:bg-primary-800"
                  : "bg-primary-50 text-primary-800 hover:bg-primary-100",
              )}
              href={href}
            >
              {isCompleted ? (
                <RotateCcw data-icon="inline-start" className="size-3.5" />
              ) : (
                <Play
                  data-icon="inline-start"
                  className="size-3.5 fill-current"
                />
              )}
              {isActive ? "Mulai" : isCompleted ? "Ulangi" : "Lihat unit"}
            </Link>
          )}
          {isActive ? (
            <span className="text-xs font-medium text-secondary-500">
              Jalur berikutnya
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function StartLessonPrompt({
  course,
  lesson,
}: {
  course: Course;
  lesson?: CourseLesson;
}) {
  if (!lesson) {
    return null;
  }

  return (
    <aside className="fixed bottom-5 left-1/2 z-40 w-[calc(100vw-2rem)] md:w-[12rem] -translate-1/2 md:translate-x-[10%] md:bottom-7">
      <Button
        className="h-20 w-full rounded-3xl px-6 shadow-[0_24px_48px_-25px_rgba(10,77,59,0.56)] gap-4"
        render={
          <Link href={`/courses/${course.slug}/${lesson.id}`}>
            <Play data-icon="inline-start" className="size-8 fill-current" />
            <span className="min-w-0 text-left">
              <span className="block text-xl font-semibold leading-none">
                Mulai
              </span>
              <span className="mt-1 block truncate text-xs font-medium text-primary-100">
                {lesson.title}
              </span>
            </span>
          </Link>
        }
        size="lg"
        variant="brand"
      />
    </aside>
  );
}

export { CourseLearningPathPageModule };

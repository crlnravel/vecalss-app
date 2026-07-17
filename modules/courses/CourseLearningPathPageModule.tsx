"use client";

import Link from "next/link";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  Play,
  RotateCcw,
  SkipForward,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

import { CourseWorkspaceShell } from "./CourseWorkspaceShell";
import {
  getCourseProgressState,
  getLessonProgressStatus,
  type Course,
  type CourseLesson,
  type LessonProgressStatus,
} from "./data";
import { skipToCourseLesson, useCourseProgress } from "./progress-storage";

function CourseLearningPathPageModule({
  course,
  courses,
  session,
}: {
  course: Course;
  courses: Course[];
  session: SessionContext;
}) {
  const progress = useCourseProgress(course, courses);
  const state = getCourseProgressState(course, {
    completedLessonIds: progress.completedLessonIds,
    skippedToLessonId: progress.skippedToLessonId,
  });

  const handleSkip = (lesson: CourseLesson) => {
    skipToCourseLesson(course.slug, lesson.id, courses);
  };

  return (
    <CourseWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel={course.title}
      mainClassName="max-w-none gap-0 p-0 lg:p-0"
      searchPlaceholder="Cari video di materi ini..."
      session={session}
    >
      <div className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden bg-[#f7faf8] pb-40 text-[#173c2d]">

        <div className="sticky top-3 z-30 mx-auto w-full max-w-[48rem] px-4 pt-3 sm:px-6">
          <SubjectSelector course={course} courses={courses} />
        </div>

        <div className="mx-auto mt-4 w-full max-w-[42rem] px-4 sm:mt-6 sm:px-6">
          <ActiveMateriBanner
            completionPercentage={state.completionPercentage}
            lesson={state.nextLesson}
          />
        </div>

        <section
          aria-label={`Jalur belajar ${course.description}`}
          className="relative mx-auto mt-2 w-full max-w-[78rem] px-3 sm:mt-5 sm:px-6 lg:px-10"
        >
          <LearningRoad lessonCount={state.lessons.length} />

          <ol className="relative z-10 m-0 list-none p-0 space-y-40">
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
  courses,
}: {
  course: Course;
  courses: Course[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleCourseChange = (slug: string) => {
    if (slug === course.slug) {
      return;
    }

    startTransition(() => {
      router.push(`/courses/${slug}`);
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className="group flex min-h-[5.75rem] w-full items-center gap-4 rounded-[2rem] border-2 border-[#d6e5db] bg-white px-4 py-3 text-left outline-none transition duration-200 hover:border-[#9dcab0] focus-visible:ring-4 focus-visible:ring-[#2f8a5d]/25 sm:min-h-[6.5rem] sm:gap-5 sm:rounded-[2.35rem] sm:px-5"
            type="button"
          />
        }
      >
        <BookOpen className="size-7 shrink-0 text-[#176b4d] sm:size-8" strokeWidth={2.4} />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.68rem] font-bold tracking-[0.16em] text-[#98a1b1] uppercase sm:text-xs">
            Materi
          </span>
          <span className="mt-1 block truncate text-xl leading-tight font-extrabold tracking-[-0.035em] text-[#1b2534] sm:hidden">
            {course.title}
          </span>
          <span className="mt-1 hidden truncate text-lg leading-tight font-extrabold tracking-[-0.025em] text-[#1b2534] sm:block md:text-xl">
            {course.description} ({course.title})
          </span>
        </span>
        {isPending ? (
          <LoaderCircle
            aria-label="Memuat materi"
            className="size-6 shrink-0 animate-spin text-[#5f776a]"
          />
        ) : (
          <ChevronDown className="size-6 shrink-0 text-[#5f776a] transition-transform motion-reduce:transform-none group-data-popup-open:rotate-180" />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="center"
        className="max-h-[min(34rem,var(--available-height))] rounded-[2rem] border border-[#d6e5db] bg-white p-2"
        sideOffset={10}
      >
        {courses.map((subject, index) => {
          const isActive = subject.slug === course.slug;

          return (
            <DropdownMenuItem
              className={cn(
                "min-h-14 cursor-pointer rounded-[1.35rem] px-3 py-2.5 text-[#173c2d] focus:bg-[#edf7f0] focus:text-[#173c2d] sm:min-h-16",
                isActive && "bg-[#e8f5ec] ring-2 ring-[#b7ddc3]",
              )}
              key={subject.slug}
              onClick={() => handleCourseChange(subject.slug)}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-xl bg-[#f2f6f3] text-sm font-extrabold sm:size-10",
                  isActive && "bg-white text-[#176b4d]",
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold sm:text-base">
                  {subject.description}
                </span>
                <span className="mt-0.5 block text-xs font-semibold text-[#98a1b1]">
                  {subject.title} · {subject.duration}
                </span>
              </span>
              {isActive ? (
                <Check
                  className="size-5 shrink-0 text-[#176b4d]"
                  strokeWidth={3}
                />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActiveMateriBanner({
  completionPercentage,
  lesson,
}: {
  completionPercentage: number;
  lesson?: CourseLesson;
}) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-[#176b4d] px-5 py-5 text-white sm:rounded-[2.35rem] sm:px-7 sm:py-6 z-10">
      <div className="relative flex items-center gap-4 sm:gap-6">
        <span className="flex size-16 shrink-0 flex-col items-center justify-center rounded-[1.45rem] border border-white/35 bg-white/10 sm:size-20">
          <span className="text-[0.62rem] font-bold tracking-[0.13em] uppercase sm:text-xs">
            Bagian
          </span>
          <span className="text-2xl leading-none font-extrabold sm:text-3xl">
            {lesson ? lesson.position + 1 : "✓"}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-bold tracking-[0.14em] text-white/75 uppercase sm:text-xs">
            {completionPercentage}% perjalanan selesai
          </p>
          <h1 className="mt-1 text-xl leading-tight font-extrabold tracking-[-0.035em] text-balance sm:text-2xl md:text-3xl">
            {lesson?.title ?? "Semua Bagian sudah selesai"}
          </h1>
        </div>
      </div>
    </div>
  );
}

const LEARNING_ROAD_ROW_HEIGHT = 100;
const LEARNING_ROAD_GAP_HEIGHT = 53;
const LEARNING_ROAD_CENTER_X = 500;
const LEARNING_ROAD_LEFT_X = 0;
const LEARNING_ROAD_RIGHT_X = 1000;

function getLearningRoadGeometry(lessonCount: number) {
  const safeLessonCount = Math.max(lessonCount, 1);
  const rowStride = LEARNING_ROAD_ROW_HEIGHT + LEARNING_ROAD_GAP_HEIGHT;
  const contentHeight =
    safeLessonCount * LEARNING_ROAD_ROW_HEIGHT +
    (safeLessonCount - 1) * LEARNING_ROAD_GAP_HEIGHT;
  const viewBoxHeight = contentHeight + 30;
  let currentX = LEARNING_ROAD_CENTER_X;
  let currentY = -30;
  let path = `M ${currentX} ${currentY}`;

  for (let index = 0; index < safeLessonCount; index += 1) {
    const targetX =
      index % 2 === 0 ? LEARNING_ROAD_RIGHT_X : LEARNING_ROAD_LEFT_X;
    const targetY = index * rowStride + LEARNING_ROAD_ROW_HEIGHT / 2;
    const controlY = currentY + (targetY - currentY) / 2;

    path += ` C ${currentX} ${controlY} ${targetX} ${controlY} ${targetX} ${targetY}`;
    currentX = targetX;
    currentY = targetY;
  }

  const finalControlY = currentY + (viewBoxHeight - currentY) / 2;
  path += ` C ${currentX} ${finalControlY} ${LEARNING_ROAD_CENTER_X} ${finalControlY} ${LEARNING_ROAD_CENTER_X} ${viewBoxHeight}`;

  return { path, viewBoxHeight };
}

function LearningRoad({ lessonCount }: { lessonCount: number }) {
  const { path, viewBoxHeight } = getLearningRoadGeometry(lessonCount);

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-1/2 h-full w-10 -translate-x-1/2 overflow-visible sm:w-20"
      preserveAspectRatio="none"
      viewBox={`0 0 1000 ${viewBoxHeight}`}
    >
      <path
        d={path}
        fill="none"
        stroke="#e2ece5"
        strokeLinecap="round"
        strokeWidth="52"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={path}
        fill="none"
        stroke="#4c9a70"
        strokeDasharray="18 34"
        strokeLinecap="round"
        strokeWidth="9"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
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
  const isActive = status === "active" || status === "available";
  const isLocked = status === "locked";
  const isEven = index % 2 === 0;
  const href = `/courses/${course.slug}/${lesson.id}`;

  return (
    <li className="relative grid min-h-[17.5rem] grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] items-center sm:min-h-[19rem] lg:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)]">
      <div
        className={cn(
          "relative z-20 col-start-2 row-start-1 flex justify-center",
          !isActive && "max-sm:hidden",
          isEven
            ? "translate-x-5 sm:translate-x-10"
            : "-translate-x-5 sm:-translate-x-10",
        )}
      >
        {isActive ? (
          <Link
            aria-label={`Mulai ${lesson.title}`}
            className="group relative grid size-[5.35rem] place-items-center rounded-[1.75rem] border-4 border-white bg-[#176b4d] text-white outline-none transition duration-200 hover:bg-[#0f563b] focus-visible:ring-4 focus-visible:ring-[#2f8a5d]/30 motion-reduce:transform-none sm:size-24 sm:rounded-[2rem]"
            href={href}
          >
            <Play className="size-9 fill-none sm:size-11" strokeWidth={2.5} />
          </Link>
        ) : (
          <span
            className={cn(
              "grid size-[4.5rem] place-items-center rounded-[1.55rem] border-4 border-white sm:size-20",
              isCompleted
                ? "bg-[#25805a] text-white"
                : "bg-[#f2f4f3] text-[#88948d]",
            )}
          >
            {isCompleted ? (
              <Check className="size-8" strokeWidth={3} />
            ) : (
              <Play className="size-8" strokeWidth={2.5} />
            )}
          </span>
        )}
      </div>

      <article
        className={cn(
          "relative z-10 col-span-3 col-start-1 row-start-1 mx-1 w-[min(21rem,calc(100%-1rem))] rounded-[1.8rem] border px-4 py-4 sm:mx-4 sm:w-[min(25rem,44vw)] sm:px-5 sm:py-5 lg:w-[28rem]",
          isActive && "max-sm:hidden",
          isEven
            ? "justify-self-start pl-2 sm:mr-[5.5rem] sm:justify-self-end sm:pl-12"
            : "justify-self-end pr-2 sm:ml-[5.5rem] sm:justify-self-start sm:pr-16",
          isLocked
            ? "border-[#dce3df] bg-[#f5f7f6] text-[#6f7d75]"
            : isCompleted
              ? "border-[#b7ddc3] bg-white"
              : "border-[#c8dfd0] bg-white",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-14 shrink-0 flex-col items-center justify-center rounded-[1.25rem] text-center sm:size-16",
              isLocked
                ? "bg-[#e8ecea] text-[#87928c]"
                : isCompleted
                  ? "bg-[#e6f4eb] text-[#176b4d]"
                  : "bg-[#eaf5ed] text-[#176b4d]",
            )}
          >
            <span className="text-[0.55rem] font-bold tracking-[0.12em] uppercase">
              Bagian
            </span>
            <span className="text-xl leading-none font-extrabold">
              {index + 1}
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="mt-1 line-clamp-2 text-base leading-snug font-extrabold tracking-[-0.025em] sm:text-lg lg:text-xl">
              {lesson.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-[#718077]">
                <Clock3 className="size-3.5" /> {lesson.duration}
              </span>
              {isCompleted ? (
                <Link
                  className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-[#e6f4eb] px-3 text-[0.68rem] font-extrabold text-[#176b4d] outline-none transition hover:bg-[#d7eddf] focus-visible:ring-3 focus-visible:ring-[#2f8a5d]/30"
                  href={href}
                >
                  <RotateCcw className="size-3.5" /> Ulangi
                </Link>
              ) : null}
              {isLocked ? (
                <button
                  className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-[#176b4d] px-3 text-[0.68rem] font-extrabold text-white outline-none transition hover:bg-[#0f563b] focus-visible:ring-3 focus-visible:ring-[#2f8a5d]/30 motion-reduce:transform-none"
                  onClick={onSkip}
                  type="button"
                >
                  <SkipForward className="size-3.5" /> Skip ke sini
                </button>
              ) : null}
              {isActive ? (
                <Link
                  className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-[#176b4d] px-3 text-[0.68rem] font-extrabold text-white outline-none transition hover:bg-[#0f563b] focus-visible:ring-3 focus-visible:ring-[#2f8a5d]/30"
                  href={href}
                >
                  <Play className="size-3.5 fill-current" /> Mulai
                </Link>
              ) : null}
            </div>
          </div>
        </div>
        {isLocked ? (
          <LockKeyhole className="absolute top-4 right-4 size-4 text-[#9aa59f]" />
        ) : null}
      </article>
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
    return (
      <aside className="fixed bottom-5 left-1/2 z-40 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 md:left-[calc(50%+8rem)]">
        <div className="flex min-h-20 items-center justify-center gap-3 rounded-[1.8rem] border border-[#b7ddc3] bg-[#176b4d] px-5 text-white">
          <Sparkles className="size-6" />
          <span className="text-base font-extrabold">Semua Bagian selesai!</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="fixed bottom-5 left-1/2 z-40 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 md:left-[calc(50%+8rem)]">
      <Link
        className="group flex min-h-20 w-full items-center gap-4 rounded-[1.8rem] border border-[#b7ddc3] bg-white px-4 py-3 text-[#173c2d] outline-none transition duration-200 hover:border-[#6aaa83] hover:bg-[#f3faf5] focus-visible:ring-4 focus-visible:ring-[#2f8a5d]/30 motion-reduce:transform-none"
        href={`/courses/${course.slug}/${lesson.id}`}
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#176b4d] text-white sm:size-14">
          <Play className="size-6 fill-current sm:size-7" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[0.65rem] font-extrabold tracking-[0.14em] text-[#477060] uppercase">
            Mulai Bagian
          </span>
          <span className="mt-0.5 block truncate text-base font-extrabold tracking-[-0.02em] sm:text-lg">
            {lesson.title}
          </span>
        </span>
        <ChevronRight
          className="size-6 shrink-0 transition-transform group-hover:translate-x-1"
          strokeWidth={2.6}
        />
      </Link>
    </aside>
  );
}

export { CourseLearningPathPageModule };

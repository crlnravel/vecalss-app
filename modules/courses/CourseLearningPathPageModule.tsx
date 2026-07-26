"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  Play,
  SkipForward,
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
  const currentPositionLessonId =
    state.nextLesson?.id ?? state.lessons[state.lessons.length - 1]?.id;

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
      <div className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden bg-[#f7faf8] pb-24 text-[#173c2d]">

        <div className="pointer-events-none sticky top-3 z-30 mx-auto h-0 w-full max-w-[48rem] px-4 pt-3 sm:px-6">
          <div className="pointer-events-auto">
            <SubjectSelector course={course} courses={courses} />
          </div>
        </div>

        <section
          aria-label={`Jalur belajar ${course.description}`}
          className="mx-auto w-full max-w-[78rem] px-3 pt-32 sm:px-6 sm:pt-36 lg:px-10"
        >
          <div className="relative">
            <LearningRoad lessonCount={state.lessons.length} />

            <ol className="relative z-10 m-0 list-none p-0">
              {state.lessons.map((lesson, index) => {
                const status = getLessonProgressStatus(course, lesson.id, {
                  completedLessonIds: progress.completedLessonIds,
                  skippedToLessonId: progress.skippedToLessonId,
                });

                return (
                  <LearningPathStage
                    course={course}
                    index={index}
                    isCurrentPosition={lesson.id === currentPositionLessonId}
                    key={lesson.id}
                    lesson={lesson}
                    onSkip={() => handleSkip(lesson)}
                    status={status}
                  />
                );
              })}
            </ol>
          </div>
        </section>
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
            className="group flex min-h-[5.75rem] w-full items-center gap-4 rounded-[2rem] border-2 border-[#d6e5db] bg-white px-4 py-3 text-left shadow-[0_18px_42px_-32px_rgba(23,107,77,0.5)] outline-none transition-[transform,border-color,box-shadow] duration-200 ease-out motion-safe:hover:-translate-y-0.5 hover:border-[#9dcab0] hover:shadow-[0_24px_52px_-30px_rgba(23,107,77,0.55)] focus:border-[#9dcab0] focus:shadow-[0_24px_52px_-30px_rgba(23,107,77,0.55)] data-popup-open:-translate-y-0.5 data-popup-open:border-[#9dcab0] data-popup-open:shadow-[0_24px_52px_-30px_rgba(23,107,77,0.55)] focus-visible:ring-4 focus-visible:ring-[#2f8a5d]/25 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.995] motion-reduce:transition-none sm:min-h-[6.5rem] sm:gap-5 sm:rounded-[2.35rem] sm:px-5"
            type="button"
          />
        }
      >
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
                "min-h-14 cursor-pointer rounded-[1.35rem] px-3 py-2.5 text-[#173c2d] transition-[transform,box-shadow] duration-150 ease-out motion-safe:hover:translate-x-1 hover:shadow-[0_10px_24px_-20px_rgba(23,107,77,0.55)] focus:translate-x-1 focus:shadow-[0_10px_24px_-20px_rgba(23,107,77,0.55)] data-highlighted:translate-x-1 data-highlighted:shadow-[0_10px_24px_-20px_rgba(23,107,77,0.55)] focus:bg-[#edf7f0] focus:text-[#173c2d] motion-safe:active:scale-[0.99] motion-reduce:transition-none sm:min-h-16",
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

const LEARNING_PATH_STAGE_HEIGHT = 432;
const LEARNING_ROAD_CENTER_X = 500;
const LEARNING_ROAD_LEFT_X = 360;
const LEARNING_ROAD_RIGHT_X = 640;

function getLearningRoadGeometry(lessonCount: number) {
  const safeLessonCount = Math.max(lessonCount, 1);
  const viewBoxHeight = safeLessonCount * LEARNING_PATH_STAGE_HEIGHT;
  const firstCardX = LEARNING_ROAD_LEFT_X;
  let currentX = firstCardX;
  let currentY = -24;
  let path = `M ${currentX} ${currentY}`;

  for (let index = 0; index < safeLessonCount; index += 1) {
    const cardX = index % 2 === 0 ? LEARNING_ROAD_LEFT_X : LEARNING_ROAD_RIGHT_X;
    const cardY = index * LEARNING_PATH_STAGE_HEIGHT + 64;
    const playX = index % 2 === 0 ? LEARNING_ROAD_RIGHT_X : LEARNING_ROAD_LEFT_X;
    const playY = index * LEARNING_PATH_STAGE_HEIGHT + 292;

    for (const [targetX, targetY] of [[cardX, cardY], [playX, playY]]) {
      const controlY = currentY + (targetY - currentY) / 2;
      path += ` C ${currentX} ${controlY} ${targetX} ${controlY} ${targetX} ${targetY}`;
      currentX = targetX;
      currentY = targetY;
    }
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
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      preserveAspectRatio="none"
      viewBox={`0 0 1000 ${viewBoxHeight}`}
    >
      <path
        d={path}
        fill="none"
        stroke="#e0eee5"
        strokeLinecap="round"
        strokeWidth="64"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={path}
        fill="none"
        stroke="#4c9a70"
        strokeDasharray="22 38"
        strokeLinecap="round"
        strokeWidth="10"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function LearningPathStage({
  course,
  index,
  isCurrentPosition,
  lesson,
  onSkip,
  status,
}: {
  course: Course;
  index: number;
  isCurrentPosition: boolean;
  lesson: CourseLesson;
  onSkip: () => void;
  status: LessonProgressStatus | undefined;
}) {
  const isCompleted = status === "completed";
  const isLocked = status === "locked";
  const isEven = index % 2 === 0;
  const href = `/courses/${course.slug}/${lesson.id}`;

  return (
    <li className="relative grid min-h-[27rem] grid-rows-[9rem_1fr] sm:min-h-[32rem] sm:grid-rows-[11rem_1fr]">
      <article
        className={cn(
          "relative z-10 flex min-h-28 w-[min(31rem,calc(100%-1rem))] items-center gap-4 self-start rounded-[2rem] border px-5 py-4 sm:min-h-32 sm:gap-5 sm:rounded-[2.25rem] sm:px-6",
          isEven
            ? "justify-self-start sm:ml-[8%] lg:ml-[12%]"
            : "justify-self-end sm:mr-[8%] lg:mr-[12%]",
          isLocked
            ? "border-[#d9e0dc] bg-[#f0f3f1] text-[#7b8780] shadow-[0_9px_0_#d5dcd8,0_24px_44px_-32px_rgba(39,62,51,0.45)]"
            : isCompleted
              ? "border-[#b7ddc3] bg-white text-[#173c2d] shadow-[0_9px_0_#b7ddc3,0_24px_44px_-32px_rgba(23,107,77,0.5)]"
              : "border-[#176b4d] bg-[#176b4d] text-white shadow-[0_9px_0_#0f563b,0_26px_48px_-30px_rgba(23,107,77,0.68)]",
        )}
      >
        <span
          className={cn(
            "flex size-16 shrink-0 flex-col items-center justify-center rounded-[1.35rem] border text-center sm:size-20 sm:rounded-[1.6rem]",
            isLocked
              ? "border-[#cfd7d2] bg-[#e5e9e7]"
              : isCompleted
                ? "border-[#cbe5d3] bg-[#e8f5ec] text-[#176b4d]"
                : "border-white/35 bg-white/10",
          )}
        >
          <span className="text-[0.6rem] font-bold tracking-[0.14em] uppercase sm:text-xs">
            Unit
          </span>
          <span className="text-2xl leading-none font-extrabold sm:text-3xl">
            {index + 1}
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-xl leading-tight font-extrabold tracking-[-0.035em] text-balance sm:text-2xl">
            {lesson.title}
          </h2>
          {isLocked ? (
            <button
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#ffd766] px-4 text-xs font-extrabold text-[#5b4b18] shadow-[0_4px_0_#d9ad32] outline-none transition-[transform,background-color,box-shadow] duration-150 hover:bg-[#ffe28c] focus-visible:ring-4 focus-visible:ring-[#d9ad32]/30 motion-safe:active:translate-y-1 motion-safe:active:shadow-none motion-reduce:transition-none sm:text-sm"
              onClick={onSkip}
              type="button"
            >
              <SkipForward className="size-4" /> Lewati ke sini
            </button>
          ) : null}
        </div>
      </article>

      <div
        className={cn(
          "relative z-20 flex w-fit flex-col items-center self-center justify-self-center",
          isEven
            ? "translate-x-12 sm:translate-x-28 lg:translate-x-36"
            : "-translate-x-12 sm:-translate-x-28 lg:-translate-x-36",
        )}
      >
        {isCurrentPosition ? (
          <span
            aria-label="Posisi belajar saat ini"
            className="pointer-events-none absolute -top-20 -left-14 z-30 block size-24 sm:-top-24 sm:-left-20 sm:size-28"
            role="img"
          >
            <span className="absolute right-1 bottom-1 left-1 h-5 rounded-[50%] bg-[#bfe9dd]/65 blur-[1px]" />
            <Image
              alt=""
              className="absolute top-1/2 left-1/2 h-28 w-auto max-w-none -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_10px_10px_rgba(20,75,55,0.24)] sm:h-36"
              height={338}
              priority={index < 2}
              src="/brand/voyage-assets/kapal-bajak-laut-vecalss.png"
              width={600}
            />
          </span>
        ) : null}

        {isLocked ? (
          <span
            aria-label={`${lesson.title} terkunci`}
            className="relative grid size-24 place-items-center rounded-[2rem] border-4 border-white bg-[#eef1ef] text-[#9aa49f] shadow-[0_9px_0_#d4dad6,0_24px_42px_-24px_rgba(61,78,69,0.44)] sm:size-28 sm:rounded-[2.35rem]"
          >
            <Play className="size-10 sm:size-12" strokeWidth={2.4} />
            <span className="absolute -right-2 -bottom-2 grid size-9 place-items-center rounded-full border-4 border-[#f7faf8] bg-[#dfe5e1]">
              <LockKeyhole className="size-4" />
            </span>
          </span>
        ) : (
          <Link
            aria-label={`${isCompleted ? "Putar ulang" : "Putar"} ${lesson.title}`}
            className={cn(
              "group relative grid size-24 place-items-center rounded-[2rem] border-4 border-white text-white outline-none transition-[transform,background-color,box-shadow] duration-200 focus-visible:ring-4 focus-visible:ring-[#2f8a5d]/30 motion-safe:hover:-translate-y-1 motion-safe:active:translate-y-1 motion-reduce:transition-none sm:size-28 sm:rounded-[2.35rem]",
              isCompleted
                ? "bg-[#2f8a5d] shadow-[0_9px_0_#176b4d,0_28px_46px_-24px_rgba(23,107,77,0.65)] hover:bg-[#267a52] motion-safe:active:shadow-[0_3px_0_#176b4d]"
                : "bg-[#176b4d] shadow-[0_10px_0_#0f563b,0_30px_50px_-22px_rgba(23,107,77,0.72)] hover:bg-[#0f563b] motion-safe:active:shadow-[0_3px_0_#0f563b]",
            )}
            href={href}
          >
            <Play className="size-10 translate-x-0.5 transition-transform duration-200 motion-safe:group-hover:scale-110 sm:size-12" strokeWidth={2.4} />
            {isCompleted ? (
              <span className="absolute -right-2 -bottom-2 grid size-9 place-items-center rounded-full border-4 border-[#f7faf8] bg-[#e6f4eb] text-[#176b4d]">
                <Check className="size-4" strokeWidth={3} />
              </span>
            ) : null}
          </Link>
        )}

        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[#d8e6dc] bg-white px-3 py-1.5 text-xs font-bold text-[#65756c] shadow-[0_10px_24px_-20px_rgba(23,107,77,0.5)]">
          <Clock3 className="size-3.5" /> {lesson.duration}
        </span>
      </div>
    </li>
  );
}

export { CourseLearningPathPageModule };

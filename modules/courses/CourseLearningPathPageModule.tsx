"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Globe2,
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
      <div className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden bg-[#fbfcff] pb-40 text-[#182334]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_88%_8%,rgba(255,237,117,0.34),transparent_30%),radial-gradient(circle_at_18%_46%,rgba(220,231,255,0.42),transparent_34%),radial-gradient(circle_at_55%_74%,rgba(240,222,255,0.34),transparent_35%)]"
        />

        <div className="sticky top-3 z-30 mx-auto w-full max-w-[48rem] px-4 pt-3 sm:px-6">
          <SubjectSelector course={course} courses={courses} />
        </div>

        <div className="mx-auto mt-4 w-full max-w-[42rem] px-4 sm:mt-6 sm:px-6">
          <ActiveUnitBanner
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
            className="group flex min-h-[5.75rem] w-full items-center gap-4 rounded-[2rem] border-2 border-[#edf0f4] bg-white px-4 py-3 text-left shadow-[0_18px_45px_-30px_rgba(39,54,82,0.42)] outline-none transition duration-200 hover:border-[#dfe8f7] hover:shadow-[0_22px_52px_-28px_rgba(39,54,82,0.5)] focus-visible:ring-4 focus-visible:ring-[#85dff4]/30 sm:min-h-[6.5rem] sm:gap-5 sm:rounded-[2.35rem] sm:px-5"
            type="button"
          />
        }
      >
        <span className="grid size-14 shrink-0 place-items-center rounded-[1.25rem] bg-[linear-gradient(135deg,#8fe2f7,#c8f26b)] text-[#17202d] shadow-[0_10px_22px_-13px_rgba(55,109,87,0.65)] sm:size-16">
          <Globe2 className="size-7 sm:size-8" strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.68rem] font-bold tracking-[0.16em] text-[#98a1b1] uppercase sm:text-xs">
            World
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
            className="size-6 shrink-0 animate-spin text-[#95a0b1]"
          />
        ) : (
          <ChevronDown className="size-6 shrink-0 text-[#95a0b1] transition-transform group-data-popup-open:rotate-180" />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="center"
        className="max-h-[min(34rem,var(--available-height))] rounded-[2rem] border border-[#e8ecf2] bg-white p-2 shadow-[0_30px_90px_-42px_rgba(28,39,61,0.5)]"
        sideOffset={10}
      >
        {courses.map((subject, index) => {
          const isActive = subject.slug === course.slug;

          return (
            <DropdownMenuItem
              className={cn(
                "min-h-14 cursor-pointer rounded-[1.35rem] px-3 py-2.5 text-[#1b2534] focus:bg-[#eff6ff] focus:text-[#1b2534] sm:min-h-16",
                isActive && "bg-[#eaf3ff] ring-2 ring-[#cfe4ff]",
              )}
              key={subject.slug}
              onClick={() => handleCourseChange(subject.slug)}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-xl bg-[#f2f4f7] text-sm font-extrabold sm:size-10",
                  isActive && "bg-white text-[#28758a]",
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
                  className="size-5 shrink-0 text-[#249475]"
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

function ActiveUnitBanner({
  completionPercentage,
  lesson,
}: {
  completionPercentage: number;
  lesson?: CourseLesson;
}) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#77d7f3,#92e3f7)] px-5 py-5 text-white shadow-[0_10px_0_#54a6bc,0_24px_50px_-30px_rgba(44,138,166,0.65)] sm:rounded-[2.35rem] sm:px-7 sm:py-6 z-10">
      <div
        aria-hidden="true"
        className="absolute -top-20 -right-12 size-48 rounded-full border-[2rem] border-white/10"
      />
      <div className="relative flex items-center gap-4 sm:gap-6">
        <span className="flex size-16 shrink-0 flex-col items-center justify-center rounded-[1.45rem] border border-white/35 bg-white/10 sm:size-20">
          <span className="text-[0.62rem] font-bold tracking-[0.13em] uppercase sm:text-xs">
            Unit
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
            {lesson?.title ?? "Semua unit sudah selesai"}
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
      <defs>
        <linearGradient id="learning-road-dashes" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#71b9ff" />
          <stop offset="0.5" stopColor="#68dfc7" />
          <stop offset="1" stopColor="#83c5ff" />
        </linearGradient>
      </defs>
      <path
        d={path}
        fill="none"
        stroke="#dcecff"
        strokeLinecap="round"
        strokeWidth="52"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={path}
        fill="none"
        stroke="url(#learning-road-dashes)"
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
            className="group relative grid size-[5.35rem] place-items-center rounded-[1.75rem] border-4 border-white bg-[#c9f167] text-white shadow-[0_9px_0_#8eb33d,0_24px_35px_-18px_rgba(80,112,30,0.6)] outline-none transition duration-200 hover:-translate-y-1 focus-visible:ring-4 focus-visible:ring-[#63d9f0]/40 sm:size-24 sm:rounded-[2rem]"
            href={href}
          >
            <Image
              alt=""
              className="pointer-events-none absolute -top-8 -left-5 size-16 object-contain drop-shadow-[0_8px_8px_rgba(31,66,54,0.18)] transition-transform duration-200 group-hover:-rotate-3 sm:-top-10 sm:-left-7 sm:size-20"
              height={80}
              src="/brand/voyage-assets/mascot-about-variation.png"
              width={80}
            />
            <Play className="size-9 fill-none sm:size-11" strokeWidth={2.5} />
          </Link>
        ) : (
          <span
            className={cn(
              "grid size-[4.5rem] place-items-center rounded-[1.55rem] border-4 border-white shadow-[0_8px_0_#c8ccd5,0_20px_32px_-20px_rgba(43,54,77,0.48)] sm:size-20",
              isCompleted
                ? "bg-[#20c7a0] text-white"
                : "bg-white/85 text-[#a7afbc]",
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
            ? "border-[#e9ecf1] bg-[#f5f6f8]/95 text-[#737d8f] shadow-[0_8px_0_#d8dce3,0_22px_45px_-30px_rgba(43,54,77,0.42)]"
            : isCompleted
              ? "border-[#c9efe5] bg-white/95 shadow-[0_8px_0_#a7dfd1,0_22px_45px_-30px_rgba(33,112,92,0.38)]"
              : "border-[#e6dcad] bg-[#fffdf3]/95 shadow-[0_8px_0_#f2ce52,0_24px_48px_-28px_rgba(142,107,19,0.48)]",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-14 shrink-0 flex-col items-center justify-center rounded-[1.25rem] text-center sm:size-16",
              isLocked
                ? "bg-[#e8eaf0] text-[#919aaa]"
                : isCompleted
                  ? "bg-[#e7faf4] text-[#16816a]"
                  : "bg-[#fff1a9] text-[#6e5a12]",
            )}
          >
            <span className="text-[0.55rem] font-bold tracking-[0.12em] uppercase">
              Unit
            </span>
            <span className="text-xl leading-none font-extrabold">
              {index + 1}
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.65rem] font-bold tracking-[0.12em] text-[#98a1b1] uppercase">
              {lesson.sectionTitle}
            </p>
            <h2 className="mt-1 line-clamp-2 text-base leading-snug font-extrabold tracking-[-0.025em] sm:text-lg lg:text-xl">
              {lesson.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-[#919aaa]">
                <Clock3 className="size-3.5" /> {lesson.duration}
              </span>
              {isCompleted ? (
                <Link
                  className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-[#e7faf4] px-3 text-[0.68rem] font-extrabold text-[#16715e] outline-none transition hover:bg-[#d7f5eb] focus-visible:ring-3 focus-visible:ring-[#63d9f0]/35"
                  href={href}
                >
                  <RotateCcw className="size-3.5" /> Ulangi
                </Link>
              ) : null}
              {isLocked ? (
                <button
                  className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-[#ffdc62] px-3 text-[0.68rem] font-extrabold text-[#5d501e] shadow-[0_3px_0_#d3aa22] outline-none transition hover:-translate-y-0.5 hover:bg-[#ffe37b] focus-visible:ring-3 focus-visible:ring-[#ffcf2f]/35 active:translate-y-0"
                  onClick={onSkip}
                  type="button"
                >
                  <SkipForward className="size-3.5" /> Skip ke sini
                </button>
              ) : null}
              {isActive ? (
                <Link
                  className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-[#ffdc62] px-3 text-[0.68rem] font-extrabold text-[#5d501e] shadow-[0_3px_0_#d3aa22] outline-none transition hover:-translate-y-0.5 hover:bg-[#ffe37b] focus-visible:ring-3 focus-visible:ring-[#ffcf2f]/35"
                  href={href}
                >
                  <Play className="size-3.5 fill-current" /> Mulai
                </Link>
              ) : null}
            </div>
          </div>
        </div>
        {isLocked ? (
          <LockKeyhole className="absolute top-4 right-4 size-4 text-[#b1b7c2]" />
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
        <div className="flex min-h-20 items-center justify-center gap-3 rounded-[1.8rem] border-4 border-white bg-[#19c9a3] px-5 text-white shadow-[0_7px_0_#0b9a7d,0_24px_48px_-26px_rgba(20,120,99,0.62)]">
          <Sparkles className="size-6" />
          <span className="text-base font-extrabold">Semua unit selesai!</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="fixed bottom-5 left-1/2 z-40 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 md:left-[calc(50%+8rem)]">
      <Link
        className="group flex min-h-20 w-full items-center gap-4 rounded-[1.8rem] border-4 border-white bg-[#ffdc62] px-4 py-3 text-[#302b1d] shadow-[0_7px_0_#d4a923,0_26px_55px_-25px_rgba(125,92,10,0.65)] outline-none transition duration-200 hover:-translate-y-1 hover:bg-[#ffe37a] focus-visible:ring-4 focus-visible:ring-[#ffd234]/35 active:translate-y-0"
        href={`/courses/${course.slug}/${lesson.id}`}
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-[#e1b72d] shadow-sm sm:size-14">
          <Play className="size-6 fill-current sm:size-7" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[0.65rem] font-extrabold tracking-[0.14em] text-[#806a24] uppercase">
            Mulai
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

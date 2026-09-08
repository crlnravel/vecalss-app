"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BookOpen,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  LoaderCircle,
  LockKeyhole,
  Play,
  SkipForward,
  Video,
} from "@/lib/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";

import { CourseWorkspaceShell } from "./CourseWorkspaceShell";
import {
  getCourseProgressState,
  getLessonProgressStatus,
  type Course,
  type CourseProgressSnapshot,
  type CourseLesson,
  type LessonProgressStatus,
} from "./data";
import { hydrateCourseProgress, useCourseProgress } from "./progress-storage";

function CourseLearningPathPageModule({
  course,
  courses,
  notificationFeed,
  progress,
  session,
}: {
  course: Course;
  courses: Course[];
  notificationFeed?: StudentNotificationFeed;
  progress: Record<string, CourseProgressSnapshot>;
  session: SessionContext;
}) {
  const serverProgress = progress[course.slug] ?? { completedLessonIds: [] };
  const localProgress = useCourseProgress(course, courses, serverProgress, session.user.id);
  const state = getCourseProgressState(course, {
    completedLessonIds: localProgress.completedLessonIds,
    skippedToLessonId: localProgress.skippedToLessonId,
  });
  const currentPositionLessonId =
    state.nextLesson?.id ?? state.lessons[state.lessons.length - 1]?.id;

  const [pendingLessonId, setPendingLessonId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSkip = async (lesson: CourseLesson) => {
    if (pendingLessonId) return;
    setPendingLessonId(lesson.id);
    setFeedback(null);

    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(course.slug)}/${encodeURIComponent(lesson.id)}/progress`, {
        body: JSON.stringify({ action: "skip" }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null) as { error?: unknown } | null;
        throw new Error(typeof errorPayload?.error === "string" ? errorPayload.error : "Progress belum tersimpan. Coba lagi.");
      }
      const payload = await response.json().catch(() => null) as {
        error?: unknown;
        snapshot?: CourseProgressSnapshot;
      } | null;
      if (
        !payload?.snapshot
        || !hydrateCourseProgress(course.slug, payload.snapshot, courses, session.user.id)
      ) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Progress belum tersimpan. Coba lagi.");
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Progress belum tersimpan. Coba lagi.");
    } finally {
      setPendingLessonId(null);
    }
  };

  return (
    <CourseWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel={course.title}
      mainClassName="max-w-none gap-0 p-0 lg:p-0"
      notificationFeed={notificationFeed}
      searchPlaceholder="Cari bacaan di materi ini..."
      session={session}
    >
      <div className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden pb-[calc(6rem+env(safe-area-inset-bottom))] text-[var(--voyage-ink)]">

        <div className="pointer-events-none sticky top-3 z-30 mx-auto h-0 w-full max-w-[48rem] px-4 pt-3 sm:px-6">
          <div className="pointer-events-auto">
            <SubjectSelector course={course} courses={courses} />
          </div>
        </div>

        <section
          aria-label={`Jalur belajar ${course.description}`}
          className="mx-auto w-full max-w-[78rem] px-3 pt-32 sm:px-6 sm:pt-36 lg:px-10"
        >
          {state.lessons.length > 0 ? (
            <div className="relative">
              <LearningRoad lessonCount={state.lessons.length} />

              {feedback ? (
                <p
                  aria-live="polite"
                  className="relative z-20 mx-auto mb-4 max-w-xl rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-center text-sm font-semibold leading-6 text-student-status-danger-fg"
                  role="status"
                >
                  {feedback}
                </p>
              ) : null}

              <ol className="relative z-10 m-0 list-none p-0">
                {state.lessons.map((lesson, index) => {
                  const status = getLessonProgressStatus(course, lesson.id, {
                    completedLessonIds: localProgress.completedLessonIds,
                    skippedToLessonId: localProgress.skippedToLessonId,
                  });

                  return (
                    <LearningPathStage
                      course={course}
                      index={index}
                      isCurrentPosition={lesson.id === currentPositionLessonId}
                      key={lesson.id}
                      lesson={lesson}
                      onSkip={() => void handleSkip(lesson)}
                      pending={pendingLessonId === lesson.id}
                      status={status}
                    />
                  );
                })}
              </ol>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl rounded-[2rem] border border-[var(--voyage-soft-border)] bg-white px-6 py-12 text-center shadow-[0_24px_50px_-42px_color-mix(in_oklab,var(--voyage-forest)_45%,transparent)]">
              <BookOpen className="mx-auto size-10 text-[var(--voyage-muted-ink)]" />
              <p className="mt-4 text-base font-extrabold text-[var(--voyage-ink)]">Belum ada bacaan terbit</p>
              <p className="mt-2 text-sm leading-6 text-[var(--voyage-muted-ink)]">Bacaan untuk subtes ini akan muncul setelah diterbitkan.</p>
            </div>
          )}
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
    if (slug === course.slug || isPending) {
      return;
    }

    startTransition(() => {
      router.push(`/courses/${slug}`);
    });
  };

  return (
    <DropdownMenu disabled={isPending}>
      <DropdownMenuTrigger
        aria-busy={isPending}
        disabled={isPending}
        render={
          <button
            className={cn(
              "group flex min-h-[5.75rem] w-full items-center gap-4 rounded-[2rem] border-2 px-4 py-3 text-left outline-none transition-[transform,border-color,box-shadow,background-color,opacity] duration-200 ease-out focus-visible:ring-4 focus-visible:ring-[var(--voyage-leaf)]/25 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.995] motion-reduce:transition-none sm:min-h-[6.5rem] sm:gap-5 sm:rounded-[2.35rem] sm:px-5",
              isPending
                ? "cursor-wait border-[var(--secondary-200)] bg-[var(--voyage-canvas)] opacity-70 shadow-[0_12px_30px_-26px_color-mix(in_oklab,var(--voyage-forest)_35%,transparent)]"
                : "border-[var(--voyage-soft-border)] bg-white shadow-[0_18px_42px_-32px_color-mix(in_oklab,var(--voyage-forest)_50%,transparent)] motion-safe:hover:-translate-y-0.5 hover:border-[var(--primary-300)] hover:shadow-[0_24px_52px_-30px_color-mix(in_oklab,var(--voyage-forest)_55%,transparent)] data-popup-open:-translate-y-0.5 data-popup-open:border-[var(--primary-300)] data-popup-open:shadow-[0_24px_52px_-30px_color-mix(in_oklab,var(--voyage-forest)_55%,transparent)]",
            )}
            type="button"
          />
        }
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[0.68rem] font-bold tracking-[0.16em] text-[var(--voyage-muted-ink)] uppercase sm:text-xs">
            Materi
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-2 text-xl leading-tight font-extrabold tracking-[-0.035em] text-[var(--voyage-ink)] sm:hidden">
            <span className="truncate">{course.title}</span>
            {isPending ? <LoaderCircle aria-label="Memuat materi" className="size-4 shrink-0 animate-spin text-[var(--voyage-muted-ink)]" role="status" /> : null}
          </span>
          <span className="mt-1 hidden min-w-0 items-center gap-2 text-lg leading-tight font-extrabold tracking-[-0.025em] text-[var(--voyage-ink)] sm:flex md:text-xl">
            <span className="truncate">{course.description} ({course.title})</span>
            {isPending ? <LoaderCircle aria-label="Memuat materi" className="size-5 shrink-0 animate-spin text-[var(--voyage-muted-ink)]" role="status" /> : null}
          </span>
        </span>
        {!isPending ? (
          <ChevronDown className="size-6 shrink-0 text-[var(--voyage-muted-ink)] transition-transform motion-reduce:transform-none group-data-popup-open:rotate-180" />
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="center"
        className="max-h-[min(34rem,var(--available-height))] rounded-[2rem] border border-[var(--voyage-soft-border)] bg-white p-2"
        sideOffset={10}
      >
        {courses.map((subject, index) => {
          const isActive = subject.slug === course.slug;

          return (
            <DropdownMenuItem
              className={cn(
                "min-h-14 cursor-pointer rounded-[1.35rem] px-3 py-2.5 text-[var(--voyage-ink)] transition-[transform,box-shadow] duration-150 ease-out motion-safe:hover:translate-x-1 hover:shadow-[0_10px_24px_-20px_color-mix(in_oklab,var(--voyage-forest)_55%,transparent)] focus:translate-x-1 focus:shadow-[0_10px_24px_-20px_color-mix(in_oklab,var(--voyage-forest)_55%,transparent)] data-highlighted:translate-x-1 data-highlighted:shadow-[0_10px_24px_-20px_color-mix(in_oklab,var(--voyage-forest)_55%,transparent)] focus:bg-[var(--voyage-sea-glass-wash)] focus:text-[var(--voyage-ink)] motion-safe:active:scale-[0.99] motion-reduce:transition-none sm:min-h-16",
                isActive && "bg-[var(--voyage-sea-glass-wash)] ring-2 ring-[var(--voyage-sea-glass)]",
              )}
              key={subject.slug}
              onClick={() => handleCourseChange(subject.slug)}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--secondary-100)] text-sm font-extrabold sm:size-10",
                  isActive && "bg-white text-[var(--voyage-forest)]",
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold sm:text-base">
                  {subject.description}
                </span>
                <span className="mt-0.5 block text-xs font-semibold text-[var(--voyage-muted-ink)]">
                  {subject.title} · {subject.lessons.length} unit
                </span>
              </span>
              {isActive ? (
                <Check
                  className="size-5 shrink-0 text-[var(--voyage-forest)]"
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
    const readX = index % 2 === 0 ? LEARNING_ROAD_RIGHT_X : LEARNING_ROAD_LEFT_X;
    const readY = index * LEARNING_PATH_STAGE_HEIGHT + 292;

    for (const [targetX, targetY] of [[cardX, cardY], [readX, readY]]) {
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
        stroke="var(--secondary-200)"
        strokeLinecap="round"
        strokeWidth="64"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={path}
        fill="none"
        stroke="var(--voyage-leaf)"
        strokeDasharray="22 38"
        strokeLinecap="round"
        strokeWidth="10"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function LearningPathStageCard({
  index,
  isCompleted,
  isEven,
  isLocked,
  lesson,
  onSkip,
  pending,
}: {
  index: number;
  isCompleted: boolean;
  isEven: boolean;
  isLocked: boolean;
  lesson: CourseLesson;
  onSkip: () => void;
  pending: boolean;
}) {
  const cardClassName = isLocked
    ? "border-[var(--secondary-200)] bg-[var(--secondary-100)] text-[var(--voyage-muted-ink)] shadow-[0_9px_0_var(--secondary-300),0_24px_44px_-32px_color-mix(in_oklab,var(--voyage-ink)_45%,transparent)]"
    : isCompleted
      ? "border-[var(--voyage-sea-glass)] bg-white text-[var(--voyage-ink)] shadow-[0_9px_0_var(--voyage-sea-glass),0_24px_44px_-32px_color-mix(in_oklab,var(--voyage-forest)_50%,transparent)]"
      : "border-[var(--voyage-forest)] bg-[var(--voyage-forest)] text-white shadow-[0_9px_0_var(--voyage-deep-hover),0_26px_48px_-30px_color-mix(in_oklab,var(--voyage-forest)_68%,transparent)]";

  return (
    <article
      className={cn(
        "relative z-10 flex min-h-28 w-[min(31rem,calc(100%-1rem))] items-center gap-4 self-start rounded-[2rem] border px-5 py-4 sm:min-h-32 sm:gap-5 sm:rounded-[2.25rem] sm:px-6",
        isEven ? "justify-self-start sm:ml-[8%] lg:ml-[12%]" : "justify-self-end sm:mr-[8%] lg:mr-[12%]",
        cardClassName,
      )}
    >
      <LearningPathStageNumber index={index} isCompleted={isCompleted} isLocked={isLocked} />
      <div className="min-w-0 flex-1">
        <h2 className={cn("line-clamp-2 text-xl leading-tight font-extrabold tracking-[-0.035em] text-balance sm:text-2xl", isLocked && "text-[var(--voyage-muted-ink)]")}>{lesson.title}</h2>
        <div className={cn("mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold sm:text-sm", isLocked ? "text-[var(--voyage-muted-ink)]" : "text-current/85")}>
          <span className="inline-flex items-center gap-1.5"><FileText className="size-3.5" /> Bacaan PDF</span>
        </div>
        <LearningPathStageDetails isLocked={isLocked} lesson={lesson} onSkip={onSkip} pending={pending} />
      </div>
    </article>
  );
}

function LearningPathStageNumber({ index, isCompleted, isLocked }: { index: number; isCompleted: boolean; isLocked: boolean }) {
  return (
    <span className={cn(
      "flex size-16 shrink-0 flex-col items-center justify-center rounded-[1.35rem] border text-center sm:size-20 sm:rounded-[1.6rem]",
      isLocked ? "border-[var(--secondary-300)] bg-[var(--secondary-200)]" : isCompleted ? "border-[var(--primary-100)] bg-[var(--voyage-sea-glass-wash)] text-[var(--voyage-forest)]" : "border-white/35 bg-white/10",
    )}>
      <span className="text-ui-xs font-bold tracking-[0.14em] uppercase">Bagian</span>
      <span className="text-2xl leading-none font-extrabold sm:text-3xl">{index + 1}</span>
    </span>
  );
}

function LearningPathStageDetails({ isLocked, lesson, onSkip, pending }: { isLocked: boolean; lesson: CourseLesson; onSkip: () => void; pending: boolean }) {
  return (
    <>
      {lesson.optionalVideo && !isLocked ? <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold sm:text-sm"><a className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 underline decoration-current/40 underline-offset-4 outline-none hover:opacity-80 focus-visible:ring-3 focus-visible:ring-[var(--voyage-leaf)]/30" href={lesson.optionalVideo.mediaUrl} rel="noreferrer" target="_blank"><Video className="size-3.5" /> Video opsional <ExternalLink className="size-3" /></a></div> : null}
      {isLocked ? <Button className="mt-3 sm:text-sm" disabled={pending} onClick={onSkip} size="learningAttention" type="button" variant="learningAttention">{pending ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <SkipForward className="size-4" />} {pending ? "Menyimpan…" : "Lewati ke sini"}</Button> : null}
    </>
  );
}

function LearningPathStageMarker({ href, index, lessonTitle, markerState, side }: { href: string; index: number; lessonTitle: string; markerState: "available" | "completed" | "current" | "current-completed" | "locked"; side: "left" | "right" }) {
  const isCompleted = markerState === "completed" || markerState === "current-completed";
  const isCurrentPosition = markerState === "current" || markerState === "current-completed";
  const isLocked = markerState === "locked";

  return (
    <div className={cn("relative z-20 flex w-fit flex-col items-center self-center justify-self-center", side === "left" ? "translate-x-12 sm:translate-x-28 lg:translate-x-36" : "-translate-x-12 sm:-translate-x-28 lg:-translate-x-36")}>
      {isCurrentPosition ? <span aria-label="Posisi belajar saat ini" className="pointer-events-none absolute -top-20 -left-14 z-30 block size-24 sm:-top-24 sm:-left-20 sm:size-28" role="img"><span className="absolute right-1 bottom-1 left-1 h-5 rounded-[50%] bg-[var(--voyage-sea-glass)]/65 blur-[1px]" /><Image alt="" className="absolute top-1/2 left-1/2 h-28 w-auto max-w-none -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_10px_10px_color-mix(in_oklab,var(--voyage-deep)_24%,transparent)] sm:h-36" height={338} priority={index < 2} src="/brand/voyage-assets/kapal-bajak-laut-vecalss.png" width={600} /></span> : null}
      {isLocked ? (
        <span aria-label={`${lessonTitle} terkunci`} className="relative grid size-24 place-items-center rounded-[2rem] border-4 border-white bg-[var(--secondary-100)] text-[var(--voyage-muted-ink)] shadow-[0_9px_0_var(--secondary-300),0_24px_42px_-24px_color-mix(in_oklab,var(--voyage-ink)_44%,transparent)] sm:size-28 sm:rounded-[2.35rem]"><Play className="size-10 sm:size-12" strokeWidth={2.2} /><span className="absolute -right-2 -bottom-2 grid size-9 place-items-center rounded-full border-4 border-[var(--voyage-canvas)] bg-[var(--secondary-200)]"><LockKeyhole className="size-4" /></span></span>
      ) : (
        <Link aria-label={`${isCompleted ? "Baca ulang" : "Baca"} ${lessonTitle}`} className={cn("group relative grid size-24 place-items-center rounded-[2rem] border-4 border-white outline-none transition-[transform,background-color,box-shadow] duration-200 focus-visible:ring-4 focus-visible:ring-[var(--voyage-leaf)]/30 motion-safe:hover:-translate-y-1 motion-safe:active:translate-y-1 motion-reduce:transition-none sm:size-28 sm:rounded-[2.35rem]", "bg-[linear-gradient(135deg,var(--voyage-sea-glass)_0%,var(--voyage-sea-glass-wash)_100%)] text-[var(--voyage-forest)]", isCompleted ? "shadow-[0_9px_0_var(--primary-300),0_28px_46px_-24px_color-mix(in_oklab,var(--voyage-forest)_65%,transparent)] motion-safe:active:shadow-[0_3px_0_var(--primary-300)]" : "shadow-[0_10px_0_var(--primary-300),0_30px_50px_-22px_color-mix(in_oklab,var(--voyage-forest)_72%,transparent)] motion-safe:active:shadow-[0_3px_0_var(--primary-300)]")} href={href}><Play className="size-10 transition-transform duration-200 motion-safe:group-hover:scale-110 sm:size-12" strokeWidth={2.2} />{isCompleted ? <span className="absolute -right-2 -bottom-2 grid size-9 place-items-center rounded-full border-4 border-[var(--voyage-canvas)] bg-[var(--voyage-sea-glass-wash)] text-[var(--voyage-forest)]"><Check className="size-4" strokeWidth={3} /></span> : null}</Link>
      )}
    </div>
  );
}

function LearningPathStage({
  course,
  index,
  isCurrentPosition,
  lesson,
  onSkip,
  pending,
  status,
}: {
  course: Course;
  index: number;
  isCurrentPosition: boolean;
  lesson: CourseLesson;
  onSkip: () => void;
  pending: boolean;
  status: LessonProgressStatus | undefined;
}) {
  const isCompleted = status === "completed";
  const isLocked = status === "locked";
  const markerState = isLocked ? "locked" : isCurrentPosition && isCompleted ? "current-completed" : isCurrentPosition ? "current" : isCompleted ? "completed" : "available";
  const side = index % 2 === 0 ? "left" : "right";

  return (
    <li className="relative grid min-h-[27rem] grid-rows-[9rem_1fr] sm:min-h-[32rem] sm:grid-rows-[11rem_1fr]">
      <LearningPathStageCard index={index} isCompleted={isCompleted} isEven={index % 2 === 0} isLocked={isLocked} lesson={lesson} onSkip={onSkip} pending={pending} />
      <LearningPathStageMarker href={`/courses/${course.slug}/${lesson.id}`} index={index} lessonTitle={lesson.title} markerState={markerState} side={side} />
    </li>
  );
}

export { CourseLearningPathPageModule };

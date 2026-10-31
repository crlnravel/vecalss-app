"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BookOpen,
  Check,
  ExternalLink,
  FileText,
  LoaderCircle,
  LockKeyhole,
  Play,
  SkipForward,
  Video,
} from "@/lib/icons";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
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
  const pendingLesson = state.lessons.find((lesson) => lesson.id === pendingLessonId);
  usePageStatusToast({
    active: pendingLessonId !== null,
    message: pendingLesson ? `Membuka materi ${pendingLesson.title}…` : "Memperbarui progres materi…",
    variant: "info",
  });

  const handleSkip = async (lesson: CourseLesson) => {
    if (pendingLessonId) return;
    setPendingLessonId(lesson.id);

    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(course.slug)}/${encodeURIComponent(lesson.id)}/progress`, {
        body: JSON.stringify({ action: "skip" }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null) as { error?: unknown } | null;
        throw new Error(typeof errorPayload?.error === "string" ? errorPayload.error : "Progres materi belum berhasil diperbarui. Periksa koneksi lalu coba lagi.");
      }
      const payload = await response.json().catch(() => null) as {
        error?: unknown;
        snapshot?: CourseProgressSnapshot;
      } | null;
      if (
        !payload?.snapshot
        || !hydrateCourseProgress(course.slug, payload.snapshot, courses, session.user.id)
      ) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Progres materi belum berhasil diperbarui. Periksa koneksi lalu coba lagi.");
      }
    } catch {
      showToast("Progres materi belum berhasil diperbarui. Periksa koneksi lalu coba lagi.", {
        action: { label: "Coba lagi", onClick: () => void handleSkip(lesson) },
        variant: "error",
      });
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

        <section
          aria-label={`Jalur belajar ${course.description}`}
          className="mx-auto w-full max-w-[78rem] px-3 pt-8 sm:px-6 sm:pt-10 lg:px-10"
        >
          {state.lessons.length > 0 ? (
            <div className="relative">
              <LearningRoad lessonCount={state.lessons.length} />

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

const LEARNING_PATH_STAGE_HEIGHT = 432;
const LEARNING_ROAD_CENTER_X = 500;
const LEARNING_ROAD_LEFT_X = 360;
const LEARNING_ROAD_RIGHT_X = 640;

function getLearningRoadGeometry(lessonCount: number) {
  const safeLessonCount = Math.max(lessonCount, 1);
  const viewBoxHeight = safeLessonCount * LEARNING_PATH_STAGE_HEIGHT;
  const firstCardX = LEARNING_ROAD_LEFT_X;
  let currentX = firstCardX;
  // Start inside the first card so the road only emerges from behind it.
  let currentY = 64;
  let path = `M ${currentX} ${currentY}`;

  for (let index = 0; index < safeLessonCount; index += 1) {
    const cardX = index % 2 === 0 ? LEARNING_ROAD_LEFT_X : LEARNING_ROAD_RIGHT_X;
    const cardY = index * LEARNING_PATH_STAGE_HEIGHT + 64;
    const readX = index % 2 === 0 ? LEARNING_ROAD_RIGHT_X : LEARNING_ROAD_LEFT_X;
    const readY = index * LEARNING_PATH_STAGE_HEIGHT + 292;

    for (const [targetX, targetY] of [[cardX, cardY], [readX, readY]]) {
      if (targetX === currentX && targetY === currentY) continue;
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
      {isLocked ? <Button className="mt-3 sm:text-sm" disabled={pending} onClick={onSkip} size="default" type="button" variant="warning">{pending ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <SkipForward className="size-4" />} {pending ? "Menyimpan…" : "Lewati ke sini"}</Button> : null}
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

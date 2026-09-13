"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clipboard,
  LockKeyhole,
  MessageCircle,
  Share2,
} from "@/lib/icons";
import { useState } from "react";

import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";

import { CourseWorkspaceShell } from "./CourseWorkspaceShell";
import { MateriLessonPresentation } from "./MateriLessonPresentation";
import {
  getCourseProgressState,
  getLessonProgressStatus,
  getNextAvailableLesson,
  type Course,
  type CourseProgressSnapshot,
  type CourseLesson,
  type LessonProgressStatus,
} from "./data";
import { hydrateCourseProgress, useCourseProgress } from "./progress-storage";

function CourseLessonPageModule({
  course,
  courses,
  lesson,
  notificationFeed,
  progress,
  session,
}: {
  course: Course;
  courses: Course[];
  lesson: CourseLesson;
  notificationFeed?: StudentNotificationFeed;
  progress: Record<string, CourseProgressSnapshot>;
  session: SessionContext;
}) {
  return (
    <CourseLessonPlayerModule
      course={course}
      courses={courses}
      lesson={lesson}
      notificationFeed={notificationFeed}
      progress={progress}
      session={session}
    />
  );
}

function CourseLessonPlayerModule({
  course,
  courses,
  lesson,
  notificationFeed,
  progress,
  session,
}: {
  course: Course;
  courses: Course[];
  lesson: CourseLesson;
  notificationFeed?: StudentNotificationFeed;
  progress: Record<string, CourseProgressSnapshot>;
  session: SessionContext;
}) {
  const serverProgress = progress[course.slug] ?? { completedLessonIds: [] };
  const localProgress = useCourseProgress(course, courses, serverProgress, session.user.id);
  const progressSnapshot = {
    completedLessonIds: localProgress.completedLessonIds,
    skippedToLessonId: localProgress.skippedToLessonId,
  } satisfies CourseProgressSnapshot;
  const lessonStatus = getLessonProgressStatus(
    course,
    lesson.id,
    progressSnapshot,
  );
  const nextLesson = getNextAvailableLesson(course, progressSnapshot);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleComplete = async () => {
    if (lessonStatus === "completed" || isPending) {
      return;
    }

    setIsPending(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(course.slug)}/${encodeURIComponent(lesson.id)}/progress`, {
        body: JSON.stringify({ action: "complete" }),
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

      const nextAfterCompletion = getNextAvailableLesson(course, payload.snapshot);
      const updatedState = getCourseProgressState(course, payload.snapshot);
      setFeedback({
        tone: "success",
        text: nextAfterCompletion
          ? `Progress tersimpan. Selanjutnya: ${nextAfterCompletion.title}.`
          : updatedState.completionPercentage === 100
            ? "Progress tersimpan. Semua bacaan di jalur ini sudah selesai."
            : "Progress tersimpan. Bacaan berikutnya belum tersedia.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Progress belum tersimpan. Coba lagi.",
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <CourseWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel={`${course.title} · ${lesson.title}`}
      mainClassName="max-w-[112rem] gap-0 px-4 py-7 md:px-8 lg:px-10 lg:py-9"
      notificationFeed={notificationFeed}
      searchPlaceholder="Cari bacaan di materi ini..."
      session={session}
    >
      {!lessonStatus || lessonStatus === "locked" ? (
        <LockedLessonState
          course={course}
          lesson={lesson}
          nextLesson={nextLesson}
        />
      ) : (
        <LessonPlayer
          course={course}
          feedback={feedback}
          lesson={lesson}
          lessonStatus={lessonStatus}
          nextLesson={nextLesson}
          onComplete={handleComplete}
          pending={isPending}
        />
      )}
    </CourseWorkspaceShell>
  );
}

function LessonPlayer({
  course,
  feedback,
  lesson,
  lessonStatus,
  nextLesson,
  onComplete,
  pending,
}: {
  course: Course;
  feedback: Feedback | null;
  lesson: CourseLesson;
  lessonStatus: LessonProgressStatus | undefined;
  nextLesson?: CourseLesson;
  onComplete: () => void;
  pending: boolean;
}) {
  const isCompleted = lessonStatus === "completed";

  return (
    <article className="mx-auto w-full max-w-[96rem]">
      <BackButton
        href={`/courses/${course.slug}`}
        label={`Kembali ke ${course.description} (${course.title})`}
      >
        <ChevronLeft />
      </BackButton>

      <MateriLessonPresentation
        action={(
          <Tooltip>
            <TooltipTrigger
              render={(
                <Button
                  aria-label="Tanya Vera"
                  nativeButton={false}
                  render={<Link href="/vera-ai" />}
                  size="icon"
                  title="Tanya Vera"
                  variant="brandOutline"
                />
              )}
            >
              <MessageCircle aria-hidden="true" className="size-5" />
            </TooltipTrigger>
            <TooltipContent>Tanya Vera</TooltipContent>
          </Tooltip>
        )}
        completionAction={(
          <Button
            className={cn(
              "min-w-0 flex-1 px-4 text-sm sm:text-base",
            )}
            disabled={isCompleted || pending}
            onClick={onComplete}
            size="learning"
            type="button"
            variant={isCompleted ? "learningComplete" : "learning"}
          >
            {isCompleted ? (
              <CheckCircle2 className="size-5" data-icon="inline-start" />
            ) : (
              <Check className="size-5" data-icon="inline-start" />
            )}
            {isCompleted ? "Sudah selesai membaca" : pending ? "Menyimpan…" : "Selesai membaca"}
          </Button>
        )}
        document={lesson.document}
        documentDeliveryUrl={getStudentDocumentDeliveryUrl(course.slug, lesson.id, lesson.document)}
        position={lesson.position}
        subject={course.description}
        title={lesson.title}
        videoUrl={lesson.optionalVideo?.mediaUrl}
      />

      <FeedbackNotice feedback={feedback} />

      {isCompleted && nextLesson ? (
        <Button
          className="mx-auto mt-5"
          nativeButton={false}
          render={<Link href={`/courses/${course.slug}/${nextLesson.id}`} />}
          size="learning"
          variant="learning"
        >
          Lanjut ke bacaan berikutnya
          <ArrowLeft className="size-4 rotate-180" />
        </Button>
      ) : null}

    </article>
  );
}

function getStudentDocumentDeliveryUrl(
  courseSlug: string,
  lessonId: string,
  document: CourseLesson["document"],
) {
  const slug = encodeURIComponent(courseSlug);
  const code = encodeURIComponent(lessonId);
  const assetId = document.sourceKind === "managed" && document.managedAssetId
    ? `?assetId=${encodeURIComponent(document.managedAssetId)}`
    : "";
  return `/api/courses/${slug}/${code}/document${assetId}`;
}

function LockedLessonState({
  course,
  lesson,
  nextLesson,
}: {
  course: Course;
  lesson: CourseLesson;
  nextLesson?: CourseLesson;
}) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col items-center rounded-[2rem] border border-[var(--secondary-200)] bg-white px-6 py-12 text-center md:px-10 md:py-16">
      <span className="grid size-16 place-items-center rounded-[1.5rem] bg-[var(--secondary-100)] text-[var(--voyage-muted-ink)]">
        <LockKeyhole className="size-8" />
      </span>
      <p className="mt-6 text-xs font-bold tracking-[0.14em] text-[var(--voyage-muted-ink)] uppercase">
        Bagian {lesson.position + 1}
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-[var(--voyage-ink)] md:text-4xl">
        Bagian ini masih terkunci
      </h1>
      <p className="mt-4 max-w-[58ch] text-sm leading-7 text-[var(--voyage-muted-ink)] md:text-base">
        {lesson.title} akan terbuka setelah kamu mengikuti urutan jalur belajar.
        Kamu juga bisa memilih “Skip ke sini” dari halaman materi.
      </p>
      {nextLesson ? (
        <Button
          className="mt-7"
          nativeButton={false}
          render={<Link href={`/courses/${course.slug}/${nextLesson.id}`} />}
          size="learning"
          variant="learning"
        >
          Lanjut ke Bagian yang tersedia
          <ArrowLeft className="size-4 rotate-180" data-icon="inline-end" />
        </Button>
      ) : (
        <BackButton
          className="mt-7"
          href={`/courses/${course.slug}`}
          label="Kembali ke Materi"
          variant="brand"
        >
          <ChevronLeft />
        </BackButton>
      )}
    </section>
  );
}

type FeedbackTone = "error" | "neutral" | "success";

type Feedback = {
  text: string;
  tone: FeedbackTone;
};

function FeedbackNotice({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) {
    return null;
  }

  const Icon =
    feedback.tone === "success"
      ? CheckCircle2
      : feedback.tone === "error"
        ? Clipboard
        : Share2;

  return (
    <div
      aria-live="polite"
      className={cn(
        "mx-auto mt-5 flex max-w-xl items-start gap-2 rounded-2xl px-4 py-3 text-left text-sm leading-6",
        feedback.tone === "error"
          ? "bg-student-status-danger-bg text-student-status-danger-fg"
          : "bg-[var(--voyage-sea-glass-wash)] text-[var(--voyage-forest)]",
      )}
      role="status"
    >
      <Icon className="mt-1 size-4 shrink-0" />
      <span>{feedback.text}</span>
    </div>
  );
}

export { CourseLessonPageModule };

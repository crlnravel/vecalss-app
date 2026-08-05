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
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { SessionContext } from "@/lib/auth/types";
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
  progress,
  session,
}: {
  course: Course;
  courses: Course[];
  lesson: CourseLesson;
  progress: Record<string, CourseProgressSnapshot>;
  session: SessionContext;
}) {
  return (
    <CourseLessonPlayerModule
      course={course}
      courses={courses}
      lesson={lesson}
      progress={progress}
      session={session}
    />
  );
}

function CourseLessonPlayerModule({
  course,
  courses,
  lesson,
  progress,
  session,
}: {
  course: Course;
  courses: Course[];
  lesson: CourseLesson;
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
      mainClassName="max-w-[112rem] gap-0 bg-white px-4 py-7 md:px-8 lg:px-10 lg:py-9"
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
          onFeedback={setFeedback}
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
  onFeedback,
  pending,
}: {
  course: Course;
  feedback: Feedback | null;
  lesson: CourseLesson;
  lessonStatus: LessonProgressStatus | undefined;
  nextLesson?: CourseLesson;
  onComplete: () => void;
  onFeedback: (feedback: Feedback | null) => void;
  pending: boolean;
}) {
  const isCompleted = lessonStatus === "completed";

  const handleShare = async () => {
    const url = window.location.href;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          text: `${lesson.title} · ${course.description}`,
          title: lesson.title,
          url,
        });
        onFeedback({ tone: "success", text: "Tautan pelajaran siap dibagikan." });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          onFeedback({ tone: "neutral", text: "Berbagi dibatalkan." });
          return;
        }
      }
    }

    try {
      if (typeof navigator.clipboard?.writeText !== "function") {
        throw new Error("Clipboard API unavailable");
      }

      await navigator.clipboard.writeText(url);
      onFeedback({ tone: "success", text: "Tautan pelajaran disalin." });
    } catch {
      onFeedback({
        tone: "error",
        text: "Tautan belum bisa disalin. Salin URL dari bilah alamat.",
      });
    }
  };

  return (
    <article className="mx-auto w-full max-w-[96rem]">
      <Button
        aria-label={`Kembali ke ${course.description} (${course.title})`}
        nativeButton={false}
        render={<Link href={`/courses/${course.slug}`} />}
        size="icon"
        title={`Kembali ke ${course.description} (${course.title})`}
        variant="ghost"
      >
        <ChevronLeft />
      </Button>

      <MateriLessonPresentation
        action={(
          <Button
          className="rounded-full border-[#d9e5de] bg-white px-5 text-[#285641] hover:bg-[#f3faf5]"
          onClick={handleShare}
          size="lg"
          type="button"
          variant="outline"
        >
          <Share2 data-icon="inline-start" />
          Bagikan
          </Button>
        )}
        document={lesson.document}
        documentDeliveryUrl={getStudentDocumentDeliveryUrl(course.slug, lesson.id, lesson.document)}
        position={lesson.position}
        subject={course.description}
        title={lesson.title}
        videoUrl={lesson.optionalVideo?.mediaUrl}
      />

      <section className="mt-8 rounded-[1.8rem] border border-[#d9e5de] bg-white px-5 py-7 text-center md:mt-10 md:px-8 md:py-9">
        <p className="text-xs font-bold tracking-[0.14em] text-[#718077] uppercase">
          Tandai progres membaca
        </p>
        <Button
          className={cn(
            "mt-4 min-h-14 min-w-[min(100%,20rem)] rounded-[1.15rem] px-7 text-base font-extrabold",
            isCompleted
              ? "bg-[#e6f4eb] text-[#176b4d] hover:bg-[#e6f4eb]"
              : "bg-[#176b4d] text-white hover:bg-[#0f563b]",
          )}
          disabled={isCompleted || pending}
          onClick={onComplete}
          size="lg"
          type="button"
        >
          {isCompleted ? (
            <CheckCircle2 className="size-5" data-icon="inline-start" />
          ) : (
            <Check className="size-5" data-icon="inline-start" />
          )}
          {isCompleted ? "Sudah selesai membaca" : pending ? "Menyimpan…" : "Selesai membaca"}
        </Button>

        <FeedbackNotice feedback={feedback} />

        {isCompleted && nextLesson ? (
          <Link
            className="mx-auto mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#e6f4eb] px-4 text-sm font-bold text-[#176b4d] outline-none transition hover:bg-[#d7eddf] focus-visible:ring-3 focus-visible:ring-[#2f8a5d]/30"
            href={`/courses/${course.slug}/${nextLesson.id}`}
          >
            Lanjut ke bacaan berikutnya
            <ArrowLeft className="size-4 rotate-180" />
          </Link>
        ) : null}
      </section>

      <Link
        className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full border border-[#b7ddc3] bg-white px-4 text-sm font-semibold text-[#176b4d] outline-none transition hover:bg-[#f3faf5] focus-visible:ring-3 focus-visible:ring-[#2f8a5d]/30 motion-reduce:transform-none"
        href="/vera-ai"
      >
        <MessageCircle className="size-5" /> Tanya Vera
      </Link>
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
    <section className="mx-auto flex w-full max-w-3xl flex-col items-center rounded-[2rem] border border-[#dce3df] bg-white px-6 py-12 text-center md:px-10 md:py-16">
      <span className="grid size-16 place-items-center rounded-[1.5rem] bg-[#eef1ef] text-[#7d8982]">
        <LockKeyhole className="size-8" />
      </span>
      <p className="mt-6 text-xs font-bold tracking-[0.14em] text-[#9aa3b2] uppercase">
        Bagian {lesson.position + 1}
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-[#172132] md:text-4xl">
        Bagian ini masih terkunci
      </h1>
      <p className="mt-4 max-w-[58ch] text-sm leading-7 text-[#727d8f] md:text-base">
        {lesson.title} akan terbuka setelah kamu mengikuti urutan jalur belajar.
        Kamu juga bisa memilih “Skip ke sini” dari halaman materi.
      </p>
      {nextLesson ? (
        <Button
          className="mt-7 rounded-[1.1rem] bg-[#176b4d] font-extrabold text-white hover:bg-[#0f563b]"
          nativeButton={false}
          render={<Link href={`/courses/${course.slug}/${nextLesson.id}`} />}
          size="lg"
        >
          Lanjut ke Bagian yang tersedia
          <ArrowLeft className="size-4 rotate-180" data-icon="inline-end" />
        </Button>
      ) : (
        <Button
          aria-label="Kembali ke Materi"
          className="mt-7 bg-[#176b4d] text-white hover:bg-[#0f563b]"
          nativeButton={false}
          render={<Link href={`/courses/${course.slug}`} />}
          size="icon"
          title="Kembali ke Materi"
          variant="brand"
        >
          <ChevronLeft />
        </Button>
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
          ? "bg-red-50 text-red-800"
          : "bg-[#eaf9f4] text-[#176d5b]",
      )}
      role="status"
    >
      <Icon className="mt-1 size-4 shrink-0" />
      <span>{feedback.text}</span>
    </div>
  );
}

export { CourseLessonPageModule };

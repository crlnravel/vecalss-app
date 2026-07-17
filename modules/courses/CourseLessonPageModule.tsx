"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
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
  getLessonProgressStatus,
  getNextAvailableLesson,
  type Course,
  type CourseLesson,
  type LessonProgressStatus,
} from "./data";
import { completeCourseLesson, useCourseProgress } from "./progress-storage";

function CourseLessonPageModule({
  course,
  courses,
  lesson,
  session,
}: {
  course: Course;
  courses: Course[];
  lesson: CourseLesson;
  session: SessionContext;
}) {
  return (
    <CourseLessonPlayerModule
      course={course}
      courses={courses}
      lesson={lesson}
      session={session}
    />
  );
}

function CourseLessonPlayerModule({
  course,
  courses,
  lesson,
  session,
}: {
  course: Course;
  courses: Course[];
  lesson: CourseLesson;
  session: SessionContext;
}) {
  const progress = useCourseProgress(course, courses);
  const progressSnapshot = {
    completedLessonIds: progress.completedLessonIds,
    skippedToLessonId: progress.skippedToLessonId,
  };
  const lessonStatus = getLessonProgressStatus(
    course,
    lesson.id,
    progressSnapshot,
  );
  const nextLesson = getNextAvailableLesson(course, progressSnapshot);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const handleComplete = () => {
    if (lessonStatus === "completed") {
      return;
    }

    const updatedProgress = completeCourseLesson(course.slug, lesson.id, courses);
    const nextAfterCompletion = getNextAvailableLesson(
      course,
      updatedProgress[course.slug],
    );

    setFeedback({
      tone: "success",
      text: nextAfterCompletion
        ? `Progress tersimpan. Selanjutnya: ${nextAfterCompletion.title}.`
        : "Progress tersimpan. Kamu sudah mencapai akhir jalur belajar ini.",
    });
  };

  return (
    <CourseWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel={`${course.title} · ${lesson.title}`}
      mainClassName="max-w-[112rem] gap-0 bg-white px-4 py-7 md:px-8 lg:px-10 lg:py-9"
      searchPlaceholder="Cari video di materi ini..."
      session={session}
    >
      {lessonStatus === "locked" ? (
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
}: {
  course: Course;
  feedback: Feedback | null;
  lesson: CourseLesson;
  lessonStatus: LessonProgressStatus | undefined;
  nextLesson?: CourseLesson;
  onComplete: () => void;
  onFeedback: (feedback: Feedback | null) => void;
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
      <Link
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-semibold text-[#176b4d] outline-none transition hover:text-[#0f563b] focus-visible:ring-3 focus-visible:ring-[#2f8a5d]/30 md:text-base"
        href={`/courses/${course.slug}`}
      >
        <ArrowLeft className="size-4" />
        Kembali ke {course.description} ({course.title})
      </Link>

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
        position={lesson.position}
        subject={course.description}
        title={lesson.title}
        videoUrl={lesson.videoUrl}
      />

      <section className="mt-8 rounded-[1.8rem] border border-[#d9e5de] bg-white px-5 py-7 text-center md:mt-10 md:px-8 md:py-9">
        <p className="text-xs font-bold tracking-[0.14em] text-[#718077] uppercase">
          Tandai progresmu
        </p>
        <Button
          className={cn(
            "mt-4 min-h-14 min-w-[min(100%,20rem)] rounded-[1.15rem] px-7 text-base font-extrabold",
            isCompleted
              ? "bg-[#e6f4eb] text-[#176b4d] hover:bg-[#e6f4eb]"
              : "bg-[#176b4d] text-white hover:bg-[#0f563b]",
          )}
          disabled={isCompleted}
          onClick={onComplete}
          size="lg"
          type="button"
        >
          {isCompleted ? (
            <CheckCircle2 className="size-5" data-icon="inline-start" />
          ) : (
            <Check className="size-5" data-icon="inline-start" />
          )}
          {isCompleted ? "Sudah Selesai" : "Selesai Menonton"}
        </Button>
        <p className="mt-4 text-sm italic text-[#8a9790]">
          Transkrip tidak tersedia
        </p>

        <FeedbackNotice feedback={feedback} />

        {isCompleted && nextLesson ? (
          <Link
            className="mx-auto mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#e6f4eb] px-4 text-sm font-bold text-[#176b4d] outline-none transition hover:bg-[#d7eddf] focus-visible:ring-3 focus-visible:ring-[#2f8a5d]/30"
            href={`/courses/${course.slug}/${nextLesson.id}`}
          >
            Lanjut ke Bagian berikutnya
            <ArrowLeft className="size-4 rotate-180" />
          </Link>
        ) : null}
      </section>

      <a
        className="fixed right-4 bottom-5 z-40 inline-flex min-h-12 items-center gap-2 rounded-full border border-[#b7ddc3] bg-white px-4 text-sm font-semibold text-[#176b4d] outline-none transition hover:bg-[#f3faf5] focus-visible:ring-3 focus-visible:ring-[#2f8a5d]/30 motion-reduce:transform-none md:right-7"
        href="/vera-ai"
      >
        <MessageCircle className="size-5" /> Tanya Vera
      </a>
    </article>
  );
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
      <Button
        className="mt-7 rounded-[1.1rem] bg-[#176b4d] font-extrabold text-white hover:bg-[#0f563b]"
        render={
          <Link
            href={
              nextLesson
                ? `/courses/${course.slug}/${nextLesson.id}`
                : `/courses/${course.slug}`
            }
          >
            {nextLesson ? "Lanjut ke Bagian yang tersedia" : "Kembali ke Materi"}
            <ArrowLeft className="size-4 rotate-180" data-icon="inline-end" />
          </Link>
        }
        size="lg"
      />
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

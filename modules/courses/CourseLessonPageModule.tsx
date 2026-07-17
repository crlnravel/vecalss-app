"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  LockKeyhole,
  MessageCircle,
  Share2,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

import { CourseWorkspaceShell } from "./CourseWorkspaceShell";
import {
  getLessonProgressStatus,
  getNextAvailableLesson,
  type Course,
  type CourseLesson,
  type LessonProgressStatus,
} from "./data";
import { completeCourseLesson, useCourseProgress } from "./progress-storage";

function getVideoUrls(mediaUrl: string) {
  try {
    const url = new URL(mediaUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathParts = url.pathname.split("/").filter(Boolean);
    const isYoutube = host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be";

    if (isYoutube) {
      const videoId = host === "youtu.be"
        ? pathParts[0]
        : url.searchParams.get("v") ?? (pathParts[0] === "embed" || pathParts[0] === "shorts" || pathParts[0] === "live" ? pathParts[1] : undefined);
      if (videoId) {
        return {
          embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0`,
          openUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
          provider: "youtube" as const,
        };
      }
    }

    const isVimeo = host === "vimeo.com" || host === "player.vimeo.com";
    if (isVimeo) {
      const videoId = host === "player.vimeo.com" && pathParts[0] === "video" ? pathParts[1] : pathParts[0];
      if (videoId) {
        return {
          embedUrl: `https://player.vimeo.com/video/${encodeURIComponent(videoId)}`,
          openUrl: `https://vimeo.com/${encodeURIComponent(videoId)}`,
          provider: "vimeo" as const,
        };
      }
    }
  } catch {
    // The repository only exposes validated URLs. Keep a defensive fallback for existing records.
  }

  return { embedUrl: mediaUrl, openUrl: mediaUrl, provider: "other" as const };
}

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
  const videoUrls = getVideoUrls(lesson.videoUrl);

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
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-semibold text-[#68cbe6] outline-none transition hover:text-[#258da9] focus-visible:ring-3 focus-visible:ring-[#68cbe6]/30 md:text-base"
        href={`/courses/${course.slug}`}
      >
        <ArrowLeft className="size-4" />
        Kembali ke {course.description} ({course.title})
      </Link>

      <header className="mt-2">
        <p className="text-xs font-bold tracking-[0.14em] text-[#98a1b1] uppercase">
          Unit {lesson.position + 1} · {lesson.sectionTitle}
        </p>
        <h1 className="mt-2 max-w-[32ch] text-3xl leading-tight font-extrabold tracking-[-0.045em] text-[#121a29] text-balance md:text-4xl lg:text-[2.8rem]">
          {lesson.title}
        </h1>
        <p className="mt-2 text-base text-[#7e8797] md:text-lg">
          {lesson.sectionTitle} · {course.description}
        </p>
      </header>

      <div className="mt-7 overflow-hidden rounded-[1.65rem] bg-black shadow-[0_26px_70px_-48px_rgba(20,28,45,0.75)] ring-1 ring-[#dfe3e9] md:mt-9 md:rounded-[2rem]">
        <div className="relative aspect-video w-full">
          <iframe
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
            loading="lazy"
            src={videoUrls.embedUrl}
            title={`Video pembelajaran: ${lesson.title}`}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          className="rounded-full border-[#dfe3e9] bg-white px-5 text-[#596476]"
          onClick={handleShare}
          size="lg"
          type="button"
          variant="outline"
        >
          <Share2 data-icon="inline-start" />
          Bagikan
        </Button>
        <a
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl px-1 text-sm font-semibold text-[#778193] underline decoration-[#c9cfd8] underline-offset-4 outline-none hover:text-[#333f52] focus-visible:ring-3 focus-visible:ring-[#68cbe6]/30 sm:self-auto"
          href={videoUrls.openUrl}
          rel="noreferrer"
          target="_blank"
        >
          {videoUrls.provider === "youtube"
            ? "Buka di YouTube"
            : videoUrls.provider === "vimeo"
              ? "Buka di Vimeo"
              : "Buka video"} <ExternalLink className="size-4" />
        </a>
      </div>

      <section className="mt-8 rounded-[1.8rem] border border-[#e3e7ed] bg-white px-5 py-7 text-center shadow-[0_24px_70px_-54px_rgba(30,42,64,0.4)] md:mt-10 md:px-8 md:py-9">
        <p className="text-xs font-bold tracking-[0.14em] text-[#a1a8b5] uppercase">
          Tandai progresmu
        </p>
        <Button
          className={cn(
            "mt-4 min-h-14 min-w-[min(100%,20rem)] rounded-[1.15rem] px-7 text-base font-extrabold shadow-[0_5px_0_#c99408]",
            isCompleted
              ? "bg-[#d9f6ed] text-[#18725f] shadow-[0_5px_0_#9edacb] hover:bg-[#d9f6ed]"
              : "bg-[#ffdc62] text-[#302b1d] hover:bg-[#ffe37a]",
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
        <p className="mt-4 text-sm italic text-[#a7aeba]">
          Transkrip tidak tersedia
        </p>

        <FeedbackNotice feedback={feedback} />

        {isCompleted && nextLesson ? (
          <Link
            className="mx-auto mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#eaf9f4] px-4 text-sm font-bold text-[#176d5b] outline-none transition hover:bg-[#d9f4eb] focus-visible:ring-3 focus-visible:ring-[#54c9ac]/30"
            href={`/courses/${course.slug}/${nextLesson.id}`}
          >
            Lanjut ke {nextLesson.title}
            <ArrowLeft className="size-4 rotate-180" />
          </Link>
        ) : null}
      </section>

      <a
        className="fixed right-4 bottom-5 z-40 inline-flex min-h-12 items-center gap-2 rounded-full border border-[#a8e4f4] bg-[#e8f9ff] px-4 text-sm font-semibold text-[#4b7e8c] shadow-[0_15px_35px_-22px_rgba(36,114,135,0.65)] outline-none transition hover:-translate-y-0.5 hover:bg-[#dff7ff] focus-visible:ring-3 focus-visible:ring-[#64cce7]/35 md:right-7"
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
    <section className="mx-auto flex w-full max-w-3xl flex-col items-center rounded-[2rem] border border-[#e2e6ec] bg-white px-6 py-12 text-center shadow-[0_30px_90px_-65px_rgba(28,39,61,0.5)] md:px-10 md:py-16">
      <span className="grid size-16 place-items-center rounded-[1.5rem] bg-[#eef0f4] text-[#8d96a6] shadow-[0_5px_0_#d7dbe2]">
        <LockKeyhole className="size-8" />
      </span>
      <p className="mt-6 text-xs font-bold tracking-[0.14em] text-[#9aa3b2] uppercase">
        Unit {lesson.position + 1}
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-[#172132] md:text-4xl">
        Pelajaran ini masih terkunci
      </h1>
      <p className="mt-4 max-w-[58ch] text-sm leading-7 text-[#727d8f] md:text-base">
        {lesson.title} akan terbuka setelah kamu mengikuti urutan jalur belajar.
        Kamu juga bisa memilih “Skip ke sini” dari halaman materi.
      </p>
      <Button
        className="mt-7 rounded-[1.1rem] bg-[#ffdc62] font-extrabold text-[#302b1d] shadow-[0_5px_0_#c99408] hover:bg-[#ffe37a]"
        render={
          <Link
            href={
              nextLesson
                ? `/courses/${course.slug}/${nextLesson.id}`
                : `/courses/${course.slug}`
            }
          >
            {nextLesson ? "Lanjut ke unit yang tersedia" : "Kembali ke materi"}
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

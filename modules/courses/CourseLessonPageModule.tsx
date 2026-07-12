"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Lock,
  Share2,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SessionContext } from "@/lib/auth/types";

import { CourseWorkspaceShell } from "./CourseWorkspaceShell";
import {
  getCourseBySlug,
  getCourseLesson,
  getLessonProgressStatus,
  getNextAvailableLesson,
  type Course,
  type CourseLesson,
  type LessonProgressStatus,
} from "./data";
import {
  completeCourseLesson,
  useCourseProgress,
} from "./progress-storage";

const YOUTUBE_VIDEO_ID = "4rPIpRTEhfY";
const YOUTUBE_WATCH_URL = `https://www.youtube.com/watch?v=${YOUTUBE_VIDEO_ID}`;

function CourseLessonPageModule({
  courseSlug,
  lessonId,
  session,
}: {
  courseSlug: string;
  lessonId: string;
  session: SessionContext;
}) {
  const course = getCourseBySlug(courseSlug);
  const lesson = course ? getCourseLesson(course, lessonId) : undefined;

  if (!course || !lesson) {
    return null;
  }

  return <CourseLessonPlayerModule course={course} lesson={lesson} session={session} />;
}

function CourseLessonPlayerModule({
  course,
  lesson,
  session,
}: {
  course: Course;
  lesson: CourseLesson;
  session: SessionContext;
}) {
  const progress = useCourseProgress(course);
  const lessonStatus = getLessonProgressStatus(course, lesson.id, {
    completedLessonIds: progress.completedLessonIds,
    skippedToLessonId: progress.skippedToLessonId,
  });
  const nextLesson = getNextAvailableLesson(course, {
    completedLessonIds: progress.completedLessonIds,
    skippedToLessonId: progress.skippedToLessonId,
  });
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  return (
    <CourseWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel={`${course.title} · ${lesson.title}`}
      searchPlaceholder="Cari video di materi ini..."
      session={session}
    >
      <div>
        <Button
          render={
            <Link href={`/courses/${course.slug}`}>
              <ArrowLeft data-icon="inline-start" />
              Kembali ke {course.title}
            </Link>
          }
          size="sm"
          variant="ghost"
        />
      </div>

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
          onComplete={() => {
            if (lessonStatus === "completed") {
              return;
            }

            const updatedProgress = completeCourseLesson(course.slug, lesson.id);
            const nextAfterCompletion = getNextAvailableLesson(
              course,
              updatedProgress[course.slug],
            );
            setFeedback({
              tone: "success",
              text: nextAfterCompletion
                ? `Selesai! Selanjutnya: ${nextAfterCompletion.title}.`
                : "Selesai! Kamu sudah menuntaskan semua pelajaran di materi ini.",
            });
          }}
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

  async function handleShare() {
    const url = window.location.href;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: lesson.title,
          text: `${lesson.title} · ${course.title}`,
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
      onFeedback({ tone: "success", text: "Tautan pelajaran disalin ke clipboard." });
    } catch {
      onFeedback({
        tone: "error",
        text: "Tautan belum bisa disalin. Coba salin URL dari bilah alamat.",
      });
    }
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-4xl border border-[#dbe8e3] bg-white p-0 shadow-[0_32px_100px_-72px_rgba(10,77,59,0.36)]">
        <CardHeader className="gap-4 border-b border-[#dbe8e3] px-5 py-6 md:px-8 md:py-8">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-secondary-500">
            <span className="rounded-full bg-primary-50 px-3 py-1.5 text-primary-800">
              {course.title}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Bagian {lesson.sectionIndex + 1} · Video {lesson.videoIndex + 1}
            </span>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl leading-tight font-semibold tracking-[-0.04em] text-secondary-950 md:text-5xl">
              {lesson.title}
            </CardTitle>
            <CardDescription className="text-base leading-7 text-secondary-500 md:text-lg">
              {lesson.sectionTitle} · {course.description}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 px-5 py-5 md:px-8 md:py-8">
          <div className="overflow-hidden rounded-3xl bg-secondary-950 shadow-inner">
            <div className="relative aspect-video w-full">
              <iframe
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="absolute inset-0 size-full border-0"
                src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?rel=0`}
                title={`Video pembelajaran: ${lesson.title}`}
              />
            </div>
          </div>

          <p className="text-sm leading-6 text-secondary-500">
            Video tidak tampil?{" "}
            <a
              className="font-semibold text-primary-800 underline decoration-primary-300 underline-offset-4 hover:text-primary-950"
              href={YOUTUBE_WATCH_URL}
              rel="noreferrer"
              target="_blank"
            >
              Buka video di YouTube <ExternalLink className="inline size-3.5" />
            </a>
          </p>

          <div className="flex flex-col gap-3 border-t border-primary-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button
              onClick={handleShare}
              size="lg"
              type="button"
              variant="outline"
            >
              <Share2 data-icon="inline-start" />
              Bagikan
            </Button>
            <Button
              className="sm:min-w-52"
              disabled={isCompleted}
              onClick={onComplete}
              size="lg"
              type="button"
              variant={isCompleted ? "secondary" : "brand"}
            >
              {isCompleted ? (
                <CheckCircle2 data-icon="inline-start" />
              ) : (
                <Check data-icon="inline-start" />
              )}
              {isCompleted ? "Sudah Selesai" : "Selesai Menonton"}
            </Button>
          </div>

          <FeedbackNotice feedback={feedback} />
        </CardContent>
      </Card>

      {isCompleted ? (
        <NextLessonNotice course={course} nextLesson={nextLesson} />
      ) : null}
    </div>
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
    <Card className="rounded-4xl border border-primary-100 bg-white shadow-[0_32px_100px_-72px_rgba(10,77,59,0.36)]">
      <CardHeader className="px-5 pt-8 md:px-10 md:pt-10">
        <div className="grid size-14 place-items-center rounded-2xl bg-secondary-100 text-secondary-500">
          <Lock className="size-7" />
        </div>
        <CardTitle className="pt-3 text-3xl leading-tight font-semibold text-secondary-950 md:text-4xl">
          Pelajaran ini masih terkunci
        </CardTitle>
        <CardDescription className="max-w-2xl text-base leading-7 text-secondary-500">
          {lesson.title} tersedia setelah kamu mengikuti urutan belajar di materi {course.title}.
          Akses dari lesson ini tidak mengubah progres secara otomatis.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-8 md:px-10 md:pb-10">
        {nextLesson ? (
          <Button
            render={
              <Link href={`/courses/${course.slug}/${nextLesson.id}`}>
                Lanjut ke pelajaran yang tersedia
                <ArrowLeft className="rotate-180" data-icon="inline-end" />
              </Link>
            }
            size="lg"
            variant="brand"
          />
        ) : (
          <Button
            render={<Link href={`/courses/${course.slug}`}>Kembali ke materi</Link>}
            size="lg"
            variant="brand"
          />
        )}
      </CardContent>
    </Card>
  );
}

function NextLessonNotice({
  course,
  nextLesson,
}: {
  course: Course;
  nextLesson?: CourseLesson;
}) {
  return (
    <Card className="rounded-3xl border border-primary-100 bg-primary-50/60">
      <CardContent className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between md:px-7">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary-900">
            <CheckCircle2 className="size-4" />
            Progress tersimpan
          </p>
          <p className="mt-1 text-sm leading-6 text-primary-900/70">
            {nextLesson
              ? `Pelajaran berikutnya: ${nextLesson.title}`
              : "Semua pelajaran di materi ini sudah selesai."}
          </p>
        </div>
        {nextLesson ? (
          <Button
            render={
              <Link href={`/courses/${course.slug}/${nextLesson.id}`}>
                Pelajaran berikutnya
                <ArrowLeft className="rotate-180" data-icon="inline-end" />
              </Link>
            }
            size="sm"
            variant="brand"
          />
        ) : null}
      </CardContent>
    </Card>
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

  const Icon = feedback.tone === "success" ? CheckCircle2 : feedback.tone === "error" ? Clipboard : Share2;

  return (
    <div
      aria-live="polite"
      className={
        feedback.tone === "error"
          ? "flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
          : "flex items-start gap-2 rounded-2xl bg-primary-50 px-4 py-3 text-sm leading-6 text-primary-900"
      }
      role="status"
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{feedback.text}</span>
    </div>
  );
}

export { CourseLessonPageModule };

import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpenCheck,
  ChevronLeft,
  Clock3,
  ListChecks,
} from "@/lib/icons";

import { Button } from "@/components/ui/button";
import { StudentBadge } from "@/components/ui/student-badge";
import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";

import { type QuizItem, type QuizSubject } from "./data";

function QuizSubjectDetailPageModule({
  notificationFeed,
  session,
  subject,
}: {
  notificationFeed?: StudentNotificationFeed;
  session: SessionContext;
  subject: QuizSubject;
}) {
  const totalQuestions = subject.quizzes.reduce(
    (total, quiz) => total + quiz.questionCount,
    0,
  );

  return (
    <CourseWorkspaceShell
      activeLabel="Kuis"
      breadcrumbLabel={subject.title}
      notificationFeed={notificationFeed}
      searchPlaceholder="Cari kuis di subjek ini..."
      session={session}
    >
      <div className="mx-auto flex w-full max-w-[78rem] flex-col gap-8">
        <Button
          aria-label="Kembali ke subjek kuis"
          className="self-start"
          nativeButton={false}
          render={<Link href="/quiz" />}
          size="icon"
          title="Kembali ke subjek kuis"
          variant="ghost"
        >
          <ChevronLeft />
        </Button>

        <section className="relative isolate overflow-hidden rounded-[2.25rem] bg-gradient-to-br from-primary-900 via-primary-800 to-primary-600 text-white shadow-[0_28px_72px_-44px_rgba(1,76,56,0.75)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 -right-16 size-80 rounded-full border-[18px] border-white/10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-[22%] bottom-[-8rem] size-64 rounded-full bg-primary-400/20 blur-3xl"
          />

          <div className="relative z-10 grid gap-8 px-6 py-8 md:grid-cols-[minmax(0,1fr)_18rem] md:items-center md:px-10 md:py-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="max-w-[42rem]">
              <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-extrabold tracking-[0.14em] text-primary-100">
                {subject.code}
              </span>
              <h1 className="mt-6 text-5xl leading-[0.94] font-extrabold tracking-[-0.04em] md:text-7xl">
                {subject.description}
              </h1>
              <p className="mt-5 max-w-[45ch] text-sm leading-7 text-primary-100 md:text-base">
                Pilih paket latihan yang ingin kamu kerjakan dan lanjutkan
                ritme belajarmu.
              </p>

              <div className="mt-7 flex flex-wrap gap-3 text-sm font-bold">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2.5">
                  <ListChecks className="size-4 text-primary-200" />
                  {subject.quizzes.length} paket
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2.5">
                  <BookOpenCheck className="size-4 text-primary-200" />
                  {totalQuestions} soal
                </span>
              </div>
            </div>

            <div className="relative min-h-[11rem] md:min-h-[17rem]">
              <div
                aria-hidden="true"
                className="absolute inset-x-3 bottom-0 h-24 rounded-full bg-primary-900/40 blur-2xl"
              />
              <Image
                alt=""
                className="absolute right-[-1rem] bottom-[-4rem] h-auto w-[16rem] max-w-none object-contain drop-shadow-[0_30px_48px_rgba(1,76,56,0.4)] md:right-[-1rem] md:bottom-[-5rem] md:w-[22rem] lg:right-[-2rem] lg:w-[27rem]"
                height={464}
                priority
                sizes="(min-width: 1280px) 432px, (min-width: 768px) 352px, 256px"
                src="/brand/mascot-vecalss.png"
                width={464}
              />
            </div>
          </div>
        </section>

        {subject.quizzes.length ? (
          <section aria-labelledby="quiz-paket-title" className="flex flex-col gap-5">
            <div className="px-1">
              <h2
                className="text-2xl leading-tight font-extrabold tracking-[-0.03em] text-secondary-900 md:text-3xl"
                id="quiz-paket-title"
              >
                Paket latihan
              </h2>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {subject.quizzes.map((quiz) => (
                <QuizCard key={quiz.slug} quiz={quiz} subject={subject} />
              ))}
            </div>
          </section>
        ) : (
          <section className="rounded-[2rem] border border-dashed border-primary-200 bg-primary-50/35 px-6 py-14 text-center shadow-[0_12px_38px_-30px_rgba(1,76,56,0.35)]">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-800">
              <ListChecks className="size-7" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-secondary-900">
              Belum ada kuis tersedia
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-secondary-500">
              Kuis untuk subjek ini belum dipublikasikan. Coba cek kembali nanti
              atau pilih subjek lain untuk mulai berlatih.
            </p>
            <Button
              className="mt-6"
              nativeButton={false}
              render={<Link href="/quiz" />}
              size="sm"
              variant="brandOutline"
            >
              Lihat subjek lain
            </Button>
          </section>
        )}
      </div>
    </CourseWorkspaceShell>
  );
}

function QuizCard({ quiz, subject }: { quiz: QuizItem; subject: QuizSubject }) {
  const hasReviewableResult = Boolean(quiz.isCompleted && quiz.latestAttemptId);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[2.5rem] border border-primary-200 bg-[linear-gradient(180deg,#eef8f1_0%,#dcefe2_100%)] text-left text-primary-900 shadow-[0_18px_42px_-34px_rgba(23,107,77,0.52)] transition-[border-color,box-shadow] duration-300 hover:border-primary-200 hover:shadow-[0_24px_52px_-30px_rgba(23,107,77,0.55)] motion-reduce:transition-none">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-18%] top-0 h-36 rounded-[50%] bg-white/65 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.25)_0%,rgba(183,221,195,0.08)_42%,rgba(47,138,93,0.08)_100%)]"
      />

      <div className="relative z-10 flex flex-col p-3 sm:p-4 md:p-5">
        <h3 className="line-clamp-2 max-w-[20ch] font-heading text-xl leading-[1.1] font-extrabold tracking-[-0.03em]">
          {quiz.title}
        </h3>
        <p className="mt-2 line-clamp-3 max-w-[40ch] text-xs leading-5 text-primary-800">
          Paket latihan siap pakai untuk drilling {subject.title.toLowerCase()}.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {quiz.duration ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-900/10 bg-white/65 px-3.5 py-2 text-xs font-medium text-primary-900">
              <Clock3 className="size-4" />
              {quiz.duration}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-900/10 bg-white/65 px-3.5 py-2 text-xs font-medium text-primary-900">
            <ListChecks className="size-4" />
            {quiz.questionCount} soal
          </span>
          <StudentBadge className="bg-white/70 text-xs" size="md" tone="category">
            {quiz.difficulty}
          </StudentBadge>
          <StudentBadge
            className="bg-white/70 text-xs"
            size="md"
            tone={quizStatusTone(quiz.status)}
          >
            {quizStatusLabel(quiz.status)}
          </StudentBadge>
        </div>

        <Button
          className="mt-6 w-full justify-center"
          nativeButton={false}
          render={
            <Link
              href={quiz.isCompleted && quiz.latestAttemptId
                ? `/quiz/${subject.slug}/${quiz.slug}/result?attemptId=${encodeURIComponent(quiz.latestAttemptId)}`
                : `/quiz/${subject.slug}/${quiz.slug}`}
            />
          }
          size="learning"
          variant="learning"
        >
          {hasReviewableResult ? "Cek hasil" : quiz.isCompleted ? "Lihat detail" : "Kerjakan"}
          <ArrowUpRight className="size-4" data-icon="inline-end" />
        </Button>
      </div>
    </article>
  );
}

function quizStatusTone(status: QuizItem["status"]) {
  if (status === "Perlu review") return "attention" as const;
  if (status === "Baru ditambahkan") return "info" as const;
  return "category" as const;
}

function quizStatusLabel(status: QuizItem["status"]) {
  return status === "Baru ditambahkan" ? "Baru" : status;
}

export { QuizSubjectDetailPageModule };

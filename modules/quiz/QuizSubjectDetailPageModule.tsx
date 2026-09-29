import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpenCheck,
  Clock3,
  ListChecks,
} from "@/lib/icons";

import { ReferenceEmptyState, ReferenceSurface } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { StudentBadge } from "@/components/ui/student-badge";
import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";

import { type QuizItem, type QuizSubject } from "./data";

const QUIZ_BADGE_CLASS_NAME =
  "border-0 font-medium shadow-[inset_0_-2px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)]";

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
      searchPlaceholder="Cari kuis di subjek ini…"
      session={session}
    >
      <div className="mx-auto flex w-full max-w-[78rem] flex-col gap-8">
        <section className="relative isolate overflow-hidden rounded-[2rem] bg-learning-hero-bg text-learning-hero-fg shadow-[0_26px_80px_-46px_color-mix(in_oklab,var(--voyage-deep)_24%,transparent)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 -right-16 size-80 rounded-full border-[18px] border-voyage-sea-glass/20"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-[22%] bottom-[-8rem] size-64 rounded-full bg-voyage-forest/55 blur-3xl"
          />
          <span aria-hidden="true" className="absolute right-8 top-8 size-8 rounded-full bg-voyage-warm-sun" />

          <div className="relative z-10 grid gap-8 px-6 py-8 md:grid-cols-[minmax(0,1fr)_18rem] md:items-center md:px-10 md:py-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="max-w-[42rem]">
              <div className="flex items-center gap-2">
                <StudentBadge
                  className={`${QUIZ_BADGE_CLASS_NAME} bg-[linear-gradient(135deg,var(--voyage-sea-glass)_0%,var(--voyage-sea-glass-wash)_100%)] !font-normal text-[var(--voyage-forest)]`}
                  size="sm"
                  tone="category"
                >
                  {subject.code}
                </StudentBadge>
              </div>
              <h1 className="mt-6 max-w-[20ch] font-display text-4xl leading-[1.05] font-extrabold tracking-[-0.04em] text-balance md:text-5xl">
                {subject.description}
              </h1>
              <p className="mt-5 max-w-[45ch] text-sm leading-7 text-learning-hero-muted md:text-base">
                Pilih paket latihan yang ingin kamu kerjakan dan lanjutkan
                ritme belajarmu.
              </p>

              <div className="mt-7 flex flex-wrap gap-3 text-sm font-bold">
                <StudentBadge
                  className={QUIZ_BADGE_CLASS_NAME}
                  size="md"
                  tone="neutral"
                >
                  <ListChecks className="size-4 text-primary-700" />
                  {subject.quizzes.length} paket
                </StudentBadge>
                <StudentBadge
                  className={QUIZ_BADGE_CLASS_NAME}
                  size="md"
                  tone="neutral"
                >
                  <BookOpenCheck className="size-4 text-primary-700" />
                  {totalQuestions} soal
                </StudentBadge>
              </div>
            </div>

            <div className="relative min-h-[11rem] md:min-h-[17rem]">
              <div
                aria-hidden="true"
                className="absolute inset-x-3 bottom-0 h-24 rounded-full bg-primary-900/40 blur-2xl"
              />
              <Image
                alt=""
                className="absolute right-[-1rem] bottom-[-4rem] h-auto w-[16rem] max-w-none object-contain drop-shadow-[0_30px_48px_color-mix(in_oklab,var(--voyage-deep)_40%,transparent)] md:right-[-1rem] md:bottom-[-5rem] md:w-[22rem] lg:right-[-2rem] lg:w-[27rem]"
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
          <ReferenceSurface as="section" className="overflow-hidden">
            <ReferenceEmptyState
              description="Kuis untuk subjek ini belum dipublikasikan. Coba cek kembali nanti atau pilih subjek lain untuk mulai berlatih."
              icon={ListChecks}
              title="Belum ada kuis tersedia"
              action={
                <Button
                  nativeButton={false}
                  render={<Link href="/quiz" />}
                  size="sm"
                  variant="brandOutline"
                >
                  Lihat subjek lain
                </Button>
              }
            />
          </ReferenceSurface>
        )}
      </div>
    </CourseWorkspaceShell>
  );
}

function QuizCard({ quiz, subject }: { quiz: QuizItem; subject: QuizSubject }) {
  const hasReviewableResult = Boolean(quiz.isCompleted && quiz.latestAttemptId);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[2.5rem] border border-primary-200 bg-white text-left text-primary-900 shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_52%,transparent)] transition-[border-color,box-shadow] duration-300 hover:border-primary-200 hover:shadow-[0_24px_52px_-30px_color-mix(in_oklab,var(--voyage-forest)_55%,transparent)] motion-reduce:transition-none">
      <div className="relative z-10 flex flex-col px-3 py-5 sm:px-4 sm:py-6 md:px-5 md:py-7">
        <h3 className="line-clamp-2 max-w-[20ch] font-heading text-xl leading-[1.1] font-extrabold tracking-[-0.03em]">
          {quiz.title}
        </h3>
        <p className="mt-2 line-clamp-3 max-w-[40ch] text-xs leading-5 text-primary-800">
          Paket latihan siap pakai untuk latihan {subject.title.toLowerCase()}.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {quiz.duration ? (
            <StudentBadge
              className={QUIZ_BADGE_CLASS_NAME}
              size="sm"
              tone="neutral"
            >
              <Clock3 className="size-4" />
              {quiz.duration}
            </StudentBadge>
          ) : null}
          <StudentBadge
            className={QUIZ_BADGE_CLASS_NAME}
            size="sm"
            tone="neutral"
          >
            <ListChecks className="size-4" />
            {quiz.questionCount} soal
          </StudentBadge>
          <StudentBadge
            className={QUIZ_BADGE_CLASS_NAME}
            size="sm"
            tone="category"
          >
            {quiz.difficulty}
          </StudentBadge>
          <StudentBadge
            className={QUIZ_BADGE_CLASS_NAME}
            size="sm"
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

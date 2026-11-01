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
import { Badge } from "@/components/ui/badge";
import { StudentCatalogueCardFrame } from "@/components/ui/student-catalogue-card";
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
                <Badge
                  className={`${QUIZ_BADGE_CLASS_NAME} bg-[linear-gradient(135deg,var(--voyage-sea-glass)_0%,var(--voyage-sea-glass-wash)_100%)] !font-normal text-[var(--voyage-forest)]`}
                  size="sm"
                  tone="category"
                >
                  {subject.code}
                </Badge>
              </div>
              <h1 className="mt-6 max-w-[20ch] font-display text-4xl leading-[1.05] font-extrabold tracking-[-0.04em] text-balance md:text-5xl">
                {subject.description}
              </h1>
              <p className="mt-5 max-w-[45ch] text-sm leading-7 text-learning-hero-muted md:text-base">
                Pilih paket latihan yang ingin kamu kerjakan dan lanjutkan
                ritme belajarmu.
              </p>

              <div className="mt-7 flex flex-wrap gap-3 text-sm font-bold">
                <Badge
                  className={QUIZ_BADGE_CLASS_NAME}
                  size="md"
                  tone="neutral"
                >
                  <ListChecks className="size-4 text-primary-700" />
                  {subject.quizzes.length} paket
                </Badge>
                <Badge
                  className={QUIZ_BADGE_CLASS_NAME}
                  size="md"
                  tone="neutral"
                >
                  <BookOpenCheck className="size-4 text-primary-700" />
                  {totalQuestions} soal
                </Badge>
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
                src="/brand/mascot-vecalss-2.png"
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

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
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
                  variant="outline"
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
    <StudentCatalogueCardFrame className="text-left" variant="kuis">
      <div className="flex flex-1 flex-col gap-5">
        <div>
          <h3 className="font-heading text-xl leading-snug font-extrabold tracking-[-0.03em] text-balance [overflow-wrap:anywhere]">
            {quiz.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {subject.title}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge size="sm" tone="category">
            {quiz.difficulty}
          </Badge>
          <Badge size="sm" tone={quizStatusTone(quiz.status)}>
            {quizStatusLabel(quiz.status)}
          </Badge>
        </div>

        <dl className="mt-auto space-y-3 rounded-field bg-voyage-sea-glass-wash p-4 text-sm leading-6 text-voyage-deep">
          <div className="flex flex-wrap items-start gap-x-1">
            <dt className="flex items-center gap-3">
              <ListChecks aria-hidden="true" className="size-4 shrink-0" />
              Jumlah soal:
            </dt>
            <dd className="font-semibold">{quiz.questionCount} soal</dd>
          </div>
          <div className="flex flex-wrap items-start gap-x-1">
            <dt className="flex items-center gap-3">
              <Clock3 aria-hidden="true" className="size-4 shrink-0" />
              Waktu:
            </dt>
            <dd className="font-semibold">{quiz.duration || "Tanpa batas waktu"}</dd>
          </div>
        </dl>

        <Button
          className="w-full justify-center"
          nativeButton={false}
          render={
            <Link
              href={quiz.isCompleted && quiz.latestAttemptId
                ? `/quiz/${subject.slug}/${quiz.slug}/result?attemptId=${encodeURIComponent(quiz.latestAttemptId)}`
                : `/quiz/${subject.slug}/${quiz.slug}`}
            />
          }
          size="lg"
          variant="default"
        >
          {hasReviewableResult ? "Cek hasil" : quiz.isCompleted ? "Lihat detail" : "Kerjakan"}
          <ArrowUpRight className="size-4" data-icon="inline-end" />
        </Button>
      </div>
    </StudentCatalogueCardFrame>
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

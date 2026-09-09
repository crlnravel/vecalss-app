import Link from "next/link";
import NextImage from "next/image";

import {
  ArrowUpRight,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
} from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentBadge } from "@/components/ui/student-badge";
import { StudentCatalogueCard } from "@/components/ui/student-catalogue-card";
import {
  buildAdminStudentPreviewQuizRoute,
  buildAdminStudentPreviewRoute,
} from "@/lib/student/preview-routes";
import {
  getStudentBannerDescription,
  getStudentBannerHeading,
  isStudentBannerDraftUnavailable,
  type AdminStudentBannerRead,
} from "@/lib/student/banner-presentation";
import type { StudentBannerVariables } from "@/lib/student/banner-content";
import { StudentBannerArtwork } from "@/modules/student/components/student-banner-artwork";
import type {
  AdminPreviewQuizAvailability,
  AdminPreviewQuizDetail,
  AdminPreviewQuizQuestion,
  AdminPreviewQuizSubjectWithQuizzes,
  AdminPreviewQuizSummary,
} from "@/lib/admin/student-preview-quiz-contract";

function QuizPreviewHeader({
  banner,
  description,
  title,
  variables,
}: {
  banner?: AdminStudentBannerRead;
  description?: string;
  title?: string;
  variables?: StudentBannerVariables;
}) {
  if (banner && isStudentBannerDraftUnavailable(banner)) {
    return (
      <header className="relative isolate overflow-hidden rounded-[2rem] border border-student-status-danger-border bg-student-status-danger-bg px-6 py-7 text-student-status-danger-fg shadow-[0_28px_60px_-38px_color-mix(in_oklab,var(--voyage-deep)_48%,transparent)] md:px-10 md:py-9">
        <div className="relative max-w-2xl">
          <h1 className="text-4xl leading-tight font-extrabold tracking-[-0.045em] md:text-5xl">Draf banner tidak tersedia</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 md:text-base">{banner.message}</p>
        </div>
      </header>
    );
  }

  const resolvedTitle = banner ? getStudentBannerHeading(banner, variables) : title ?? "Kuis";
  const resolvedDescription = banner ? getStudentBannerDescription(banner, variables) : description ?? "";

  return (
    <header className="relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(120deg,var(--voyage-deep)_0%,var(--voyage-forest)_58%,var(--voyage-leaf)_100%)] px-6 py-7 text-white shadow-[0_28px_60px_-38px_color-mix(in_oklab,var(--voyage-deep)_70%,transparent)] md:px-10 md:py-9">
      {banner?.design ? <StudentBannerArtwork banner={banner} className="absolute inset-0 size-full rounded-none" variables={variables} /> : null}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-[-3rem] size-56 rounded-full border-[18px] border-[var(--voyage-sea-glass)]/15 sm:size-72"
      />
      <div className="relative max-w-2xl">
        <h1 className={banner?.design ? "sr-only" : "text-4xl leading-tight font-extrabold tracking-[-0.045em] md:text-5xl"}>{resolvedTitle}</h1>
        <p className={banner?.design ? "sr-only" : "mt-3 max-w-xl text-sm leading-7 text-[var(--primary-50)] md:text-base"}>{resolvedDescription}</p>
      </div>
    </header>
  );
}

function availabilityTone(availability: AdminPreviewQuizAvailability) {
  if (availability.kind === "closed") return "attention" as const;
  if (availability.kind === "upcoming") return "info" as const;
  return "category" as const;
}

function AvailabilityBadge({ availability }: { availability: AdminPreviewQuizAvailability }) {
  return (
    <StudentBadge className="bg-white/75 text-xs" size="md" tone={availabilityTone(availability)}>
      {availability.label}
    </StudentBadge>
  );
}

const quizDateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function formatQuizDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return quizDateFormatter.format(date);
}

function QuizSchedule({ availability }: { availability: AdminPreviewQuizAvailability }) {
  const opensAt = formatQuizDate(availability.opensAt);
  const closesAt = formatQuizDate(availability.closesAt);
  if (!opensAt && !closesAt) return null;

  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-primary-800">
      <Clock3 className="size-4 shrink-0" />
      {opensAt ? `Buka ${opensAt}` : "Sudah tersedia"}
      {closesAt ? ` · Tutup ${closesAt}` : " · Tanpa batas tutup"}
    </p>
  );
}

function QuizPreviewQuestionMedia({ media }: { media: AdminPreviewQuizQuestion["media"] }) {
  if (!media) return null;

  return (
    // The DTO only permits HTTPS image URLs; the image is never a link or an HTML injection boundary.
    <NextImage
      alt={media.alt}
      className="max-h-56 max-w-full rounded-2xl border border-primary-100 object-contain"
      height={224}
      loading="lazy"
      referrerPolicy="no-referrer"
      src={media.url}
      unoptimized
      width={400}
    />
  );
}

function AdminStudentPreviewQuizCatalogueSurface({
  banner,
  bannerVariables,
  subjects,
}: {
  banner: AdminStudentBannerRead;
  bannerVariables: StudentBannerVariables;
  subjects: AdminPreviewQuizSubjectWithQuizzes[];
}) {
  const subjectGroups = (["TPS", "TPA"] as const)
    .map((track) => ({
      subjects: subjects.filter((subject) => subject.track === track),
      track,
    }))
    .filter((group) => group.subjects.length > 0);

  return (
    <section className="mx-auto flex w-full max-w-[78rem] flex-col gap-8">
      <QuizPreviewHeader banner={banner} variables={bannerVariables} />

      <div className="flex items-center gap-3 rounded-2xl border border-[var(--warning-200)] bg-[var(--warning-50)] px-4 py-3 text-sm leading-6 text-secondary-700">
        <span className="font-bold text-[var(--voyage-warm-sun-ink)]">Read-only</span>
        <span>Kuis hanya dibaca untuk memeriksa tampilan siswa. Tidak ada percobaan, jawaban, atau nilai yang dibuat.</span>
      </div>

      {subjectGroups.length > 0 ? (
        <div className="flex flex-col gap-10">
          {subjectGroups.map((group) => (
            <section aria-labelledby={`preview-quiz-group-${group.track}`} className="flex flex-col gap-4" key={group.track}>
              <div className="flex items-center gap-4 px-1">
                <h2 className="shrink-0 text-lg font-extrabold tracking-[-0.025em] text-secondary-900 md:text-xl" id={`preview-quiz-group-${group.track}`}>
                  Subjek {group.track}
                </h2>
                <span aria-hidden="true" className="h-px flex-1 bg-[var(--voyage-soft-border)]" />
              </div>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {group.subjects.map((subject) => (
                  <StudentCatalogueCard href={buildAdminStudentPreviewQuizRoute(subject.slug)} key={subject.slug} variant="kuis">
                    <div className="flex items-start justify-between gap-4">
                      <span className="grid size-14 place-items-center rounded-[1.25rem] bg-[linear-gradient(135deg,var(--voyage-sea-glass)_0%,var(--voyage-sea-glass-wash)_100%)] text-[var(--voyage-forest)] shadow-[inset_0_-2px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)] md:size-20 md:rounded-[1.6rem]">
                        <ListChecks className="size-7 md:size-9" strokeWidth={2.2} />
                      </span>
                      <span className="rounded-full bg-white/75 px-3 py-2 text-xs font-extrabold tracking-[0.13em] text-primary-800">{subject.code}</span>
                    </div>

                    <div className="mt-8">
                      <h3 className="text-4xl leading-[0.94] font-extrabold tracking-[-0.04em] md:text-5xl">{subject.name}</h3>
                      <p className="mt-3 max-w-[28ch] text-sm leading-6 text-primary-800 md:text-base">{subject.description}</p>
                    </div>

                    <div className="mt-auto flex items-end justify-between gap-4 pt-8">
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-800">
                        <BookOpenCheck className="size-4" />
                        {subject.quizzes.length} kuis terbit
                      </span>
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--voyage-forest)] text-white shadow-[0_10px_24px_-16px_color-mix(in_oklab,var(--voyage-forest)_75%,transparent)]">
                        <ChevronRight className="size-5" strokeWidth={2.6} />
                      </span>
                    </div>
                  </StudentCatalogueCard>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Card className="rounded-[2rem] border border-dashed border-primary-200 bg-primary-50/35 py-12 text-center shadow-none">
          <CardHeader>
            <CardTitle>Belum ada kuis terbit</CardTitle>
            <CardDescription>Kuis yang sudah dipublikasikan akan muncul di preview ini.</CardDescription>
          </CardHeader>
        </Card>
      )}
    </section>
  );
}

function AdminStudentPreviewQuizSubjectSurface({ subject }: { subject: AdminPreviewQuizSubjectWithQuizzes }) {
  const totalQuestions = subject.quizzes.reduce((total, quiz) => total + quiz.questionCount, 0);

  return (
    <section className="mx-auto flex w-full max-w-[78rem] flex-col gap-8">
      <Button
        aria-label="Kembali ke katalog Kuis"
        className="self-start"
        nativeButton={false}
        render={<Link href={buildAdminStudentPreviewRoute("/quiz")} />}
        size="icon"
        title="Kembali ke katalog Kuis"
        variant="ghost"
      >
        <ChevronLeft />
      </Button>

      <QuizPreviewHeader description={subject.description} title={subject.name} />
      <div className="flex flex-wrap gap-3 text-sm font-bold text-primary-800">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-primary-50 px-4 py-2.5">
          <ListChecks className="size-4" />
          {subject.quizzes.length} kuis terbit
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-primary-50 px-4 py-2.5">
          <BookOpenCheck className="size-4" />
          {totalQuestions} soal
        </span>
      </div>

      {subject.quizzes.length > 0 ? (
        <section aria-labelledby="preview-quiz-package-title" className="flex flex-col gap-5">
          <h2 className="px-1 text-2xl leading-tight font-extrabold tracking-[-0.03em] text-secondary-900 md:text-3xl" id="preview-quiz-package-title">
            Kuis terbit
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {subject.quizzes.map((quiz) => <QuizSummaryCard key={quiz.slug} quiz={quiz} subjectSlug={subject.slug} />)}
          </div>
        </section>
      ) : (
        <Card className="rounded-[2rem] border border-dashed border-primary-200 bg-primary-50/35 py-12 text-center shadow-none">
          <CardHeader>
            <CardTitle>Belum ada kuis terbit</CardTitle>
            <CardDescription>Kuis untuk subjek ini belum dipublikasikan.</CardDescription>
          </CardHeader>
        </Card>
      )}
    </section>
  );
}

function QuizSummaryCard({ quiz, subjectSlug }: { quiz: AdminPreviewQuizSummary; subjectSlug: string }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[2.5rem] border border-primary-200 bg-[linear-gradient(180deg,var(--voyage-sea-glass-wash)_0%,#dcefe2_100%)] text-left text-primary-900 shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_52%,transparent)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-[-18%] top-0 h-36 rounded-[50%] bg-white/65 blur-3xl" />
      <div className="relative z-10 flex flex-col p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 max-w-[20ch] font-heading text-xl leading-[1.1] font-extrabold tracking-[-0.03em]">{quiz.title}</h3>
          <span className="shrink-0 rounded-full border border-primary-900/10 bg-white/65 px-2.5 py-1 text-xs font-extrabold tracking-[0.12em] text-primary-800 uppercase">Published</span>
        </div>
        {quiz.description ? <p className="mt-2 line-clamp-3 text-xs leading-5 text-primary-800">{quiz.description}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-900/10 bg-white/65 px-3.5 py-2 text-xs font-medium text-primary-900">
            <ListChecks className="size-4" />
            {quiz.questionCount} soal
          </span>
          <AvailabilityBadge availability={quiz.availability} />
        </div>
        <QuizSchedule availability={quiz.availability} />
        <Button
          className="mt-6 w-full justify-center"
          nativeButton={false}
          render={<Link href={buildAdminStudentPreviewQuizRoute(subjectSlug, quiz.slug)} />}
          size="learning"
          variant="learning"
        >
          Lihat kuis
          <ArrowUpRight className="size-4" data-icon="inline-end" />
        </Button>
      </div>
    </article>
  );
}

function AdminStudentPreviewQuizDetailSurface({ quiz }: { quiz: AdminPreviewQuizDetail }) {
  return (
    <section className="mx-auto flex w-full max-w-[78rem] flex-col gap-8">
      <Button
        aria-label={`Kembali ke ${quiz.subject.name}`}
        className="self-start"
        nativeButton={false}
        render={<Link href={buildAdminStudentPreviewQuizRoute(quiz.subject.slug)} />}
        size="icon"
        title={`Kembali ke ${quiz.subject.name}`}
        variant="ghost"
      >
        <ChevronLeft />
      </Button>

      <QuizPreviewHeader description={quiz.description ?? "Kuis terbit untuk dibaca dalam pengalaman siswa."} title={quiz.title} />
      <div className="flex flex-wrap items-center gap-3">
        <AvailabilityBadge availability={quiz.availability} />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50 px-3.5 py-2 text-xs font-bold text-primary-800">
          <ListChecks className="size-4" />
          {quiz.questionCount} soal
        </span>
      </div>
      <QuizSchedule availability={quiz.availability} />

      <Card className="rounded-[2rem] border border-[var(--warning-200)] bg-[var(--warning-50)] shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">Tampilan read-only</CardTitle>
          <CardDescription>Jawaban dan penilaian tidak tersedia di admin student preview. Membuka halaman ini tidak membuat state learner.</CardDescription>
        </CardHeader>
      </Card>

      <section aria-labelledby="preview-quiz-questions-title" className="grid gap-5">
        <h2 className="px-1 text-2xl leading-tight font-extrabold tracking-[-0.03em] text-secondary-900 md:text-3xl" id="preview-quiz-questions-title">
          Daftar soal
        </h2>
        {quiz.questions.map((question) => <QuizQuestionCard key={question.key} question={question} />)}
      </section>
    </section>
  );
}

function QuizQuestionCard({ question }: { question: AdminPreviewQuizQuestion }) {
  return (
    <Card className="rounded-[2rem] border border-primary-100 bg-white shadow-none">
      <CardHeader>
        <p className="text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">Soal {question.displayOrder}</p>
        <CardTitle className="text-lg leading-7 text-secondary-900">{question.prompt}</CardTitle>
        <QuizPreviewQuestionMedia media={question.media} />
      </CardHeader>
      <CardContent>
        {question.choices.length > 0 ? (
          <ol className="grid gap-3" aria-label={`Pilihan soal ${question.displayOrder}`}>
            {question.choices.map((choice) => (
              <li className="flex items-start gap-3 rounded-2xl border border-secondary-200 bg-secondary-50/50 px-4 py-3 text-sm leading-6 text-secondary-700" key={choice.key}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-800">{choice.key}</span>
                <span className="min-w-0 flex-1">
                  <span className="block">{choice.text}</span>
                  <QuizPreviewQuestionMedia media={choice.media} />
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-secondary-500">Pilihan soal belum tersedia.</p>
        )}
      </CardContent>
    </Card>
  );
}

export {
  AdminStudentPreviewQuizCatalogueSurface,
  AdminStudentPreviewQuizDetailSurface,
  AdminStudentPreviewQuizSubjectSurface,
};

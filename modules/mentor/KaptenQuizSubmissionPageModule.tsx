import Link from "next/link";
import { Check, ChevronLeft } from "@/lib/icons";

import {
  ReferencePageHeader,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Submission = {
  answeredCount: number;
  correctCount: number | null;
  createdAt: string;
  id: string;
  questions: Array<{
    explanation: string | null;
    options: Array<{ correct: boolean; id: string; key: string; text: string }>;
    prompt: string;
    selectedOptionId: string | null;
    selectedOptionIds?: string[];
    questionType?: "single_choice" | "multiple_choice";
  }>;
  score: number | null;
  status: string;
  student: { name: string };
  submittedAt: string | null;
  quiz: { id: string; questionCount: number; subject: string; title: string };
};

const dateTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

function KaptenQuizSubmissionPageModule({
  submission,
  returnHref = "/mentor/quiz",
}: {
  returnHref?: string;
  submission: Submission;
}) {
  const isSubmitted = submission.status !== "in_progress";

  return (
    <div className="space-y-8">
      <div className="flex min-w-0 items-start gap-3">
        <Button
          aria-label="Kembali ke hasil Kuis"
          className="mt-1 shrink-0"
          nativeButton={false}
          render={
            <Link href={`/mentor/quiz/${submission.quiz.id}?tab=hasil&returnTo=${encodeURIComponent(returnHref)}`} />
          }
          size="icon"
          title="Kembali ke hasil Kuis"
          variant="outline"
        >
          <ChevronLeft />
        </Button>
        <ReferencePageHeader
          className="min-w-0 flex-1"
          title={submission.student.name}
        />
      </div>
      <ReferenceSurface as="section" className="p-5 sm:p-7">
        <dl className="grid gap-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-secondary-500">Kuis</dt>
            <dd className="mt-1 font-semibold text-secondary-900">
              {submission.quiz.title}
            </dd>
          </div>
          <div>
            <dt className="text-secondary-500">Mulai</dt>
            <dd className="mt-1 font-semibold text-secondary-900">
              <time dateTime={submission.createdAt}>
                {dateTime.format(new Date(submission.createdAt))}
              </time>
            </dd>
          </div>
          <div>
            <dt className="text-secondary-500">Skor</dt>
            <dd className="mt-1 font-semibold tabular-nums text-secondary-900">
              {isSubmitted ? (submission.score ?? 0) : "Belum dihitung"}
            </dd>
          </div>
        </dl>
      </ReferenceSurface>

      <ReferenceSurface as="section" className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-xl leading-tight font-semibold tracking-[-0.025em] text-secondary-900">
            Soal
          </h2>
          <p className="text-sm text-secondary-500">
            {isSubmitted
              ? `${submission.correctCount ?? 0} benar dari ${submission.quiz.questionCount} soal`
              : `${submission.answeredCount} dari ${submission.quiz.questionCount} soal terjawab`}
          </p>
        </div>
        <ol className="mt-5 grid gap-4">
          {submission.questions.map((question, index) => (
            <SubmissionQuestion
              isSubmitted={isSubmitted}
              key={`${submission.id}-${index}`}
              question={question}
              sequence={index + 1}
            />
          ))}
        </ol>
      </ReferenceSurface>
    </div>
  );
}

function SubmissionQuestion({
  isSubmitted,
  question,
  sequence,
}: {
  isSubmitted: boolean;
  question: Submission["questions"][number];
  sequence: number;
}) {
  const selectedOptionIds = question.selectedOptionIds?.length
    ? question.selectedOptionIds
    : question.selectedOptionId
      ? [question.selectedOptionId]
      : [];
  const selectedOptionIdSet = new Set(selectedOptionIds);
  return (
    <li className="rounded-3xl border border-primary-100/80 bg-secondary-50/35 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary-50 text-xs font-bold text-primary-800">
          {sequence}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-6 text-secondary-900">
            {question.prompt}
          </p>
          <ul className="mt-3 grid gap-2">
            {question.options.map((option) => (
              <OptionReview
                isSubmitted={isSubmitted}
                key={option.id}
                option={option}
                selected={selectedOptionIdSet.has(option.id)}
              />
            ))}
          </ul>
          {isSubmitted && question.explanation ? null : null}
        </div>
      </div>
    </li>
  );
}

function OptionReview({
  isSubmitted,
  option,
  selected,
}: {
  isSubmitted: boolean;
  option: Submission["questions"][number]["options"][number];
  selected: boolean;
}) {
  const isCorrect = option.correct;
  const isIncorrectSelection = isSubmitted && selected && !isCorrect;
  return (
    <li
      className={cn(
        "flex gap-2 rounded-xl border px-3 py-2 text-sm",
        isSubmitted && isCorrect
          ? "border-student-status-success-border bg-student-status-success-bg text-student-status-success-fg"
          : isIncorrectSelection
            ? "border-student-status-danger-border bg-student-status-danger-bg text-student-status-danger-fg"
            : selected
              ? "border-transparent bg-accent-200 text-secondary-900"
              : "border-transparent bg-secondary-50 text-secondary-700",
      )}
    >
      <span className="font-semibold">{option.key}.</span>
      <span>{option.text}</span>
      {isCorrect ? (
        <Check
          aria-label="Jawaban benar"
          className="ml-auto size-4 shrink-0 text-primary-700"
        />
      ) : null}
      {selected && !isSubmitted ? (
        <span className="ml-auto shrink-0 text-xs font-semibold text-secondary-600">
          Dipilih siswa
        </span>
      ) : null}
      {isIncorrectSelection ? (
        <span className="ml-auto shrink-0 text-xs font-semibold text-student-status-danger-fg">
          Dipilih siswa
        </span>
      ) : null}
    </li>
  );
}

export { KaptenQuizSubmissionPageModule };

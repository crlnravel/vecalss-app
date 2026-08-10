import Link from "next/link";
import { Check, ChevronLeft } from "@/lib/icons";

import { Badge } from "@/components/ui/badge";
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
  }>;
  score: number | null;
  status: string;
  student: { name: string };
  submittedAt: string | null;
  quiz: { id: string; questionCount: number; subject: string; title: string };
};

const dateTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

function KaptenQuizSubmissionPageModule({ submission }: { submission: Submission }) {
  const isSubmitted = submission.status !== "in_progress";

  return <div>
    <Button aria-label="Kembali ke hasil quiz" render={<Link href={`/mentor/quiz/${submission.quiz.id}/results`} />} size="icon" title="Kembali ke hasil quiz" variant="ghost"><ChevronLeft /></Button>
    <header className="mt-3 rounded-3xl border border-primary-100 bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3"><h1 className="text-3xl font-semibold tracking-[-0.03em] text-secondary-900">{submission.student.name}</h1><Badge className={cn("rounded-full px-3 py-1.5 text-xs", isSubmitted ? "bg-primary-50 text-primary-800" : "bg-accent-200 text-secondary-900")} size="ui" variant={isSubmitted ? "mint" : "accent"}>{isSubmitted ? "Terkirim" : "Sedang dikerjakan"}</Badge></div>
      <dl className="mt-6 grid gap-4 border-t border-primary-100 pt-5 text-sm sm:grid-cols-3"><div><dt className="text-secondary-500">Quiz</dt><dd className="mt-1 font-semibold text-secondary-900">{submission.quiz.title}</dd></div><div><dt className="text-secondary-500">Mulai</dt><dd className="mt-1 font-semibold text-secondary-900"><time dateTime={submission.createdAt}>{dateTime.format(new Date(submission.createdAt))}</time></dd></div><div><dt className="text-secondary-500">Skor</dt><dd className="mt-1 font-semibold tabular-nums text-secondary-900">{isSubmitted ? submission.score ?? 0 : "Belum dihitung"}</dd></div></dl>
    </header>

    <section className="mt-5 rounded-3xl border border-primary-100 bg-white p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-secondary-900">Soal</h2><p className="text-sm text-secondary-500">{isSubmitted ? `${submission.correctCount ?? 0} benar dari ${submission.quiz.questionCount} soal` : `${submission.answeredCount} dari ${submission.quiz.questionCount} soal terjawab`}</p></div><ol className="mt-5 grid gap-4">{submission.questions.map((question, index) => <SubmissionQuestion isSubmitted={isSubmitted} key={`${submission.id}-${index}`} question={question} sequence={index + 1} />)}</ol></section>
  </div>;
}

function SubmissionQuestion({ isSubmitted, question, sequence }: { isSubmitted: boolean; question: Submission["questions"][number]; sequence: number }) {
  return <li className="rounded-2xl border border-primary-100 p-4"><div className="flex items-start gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-50 text-xs font-bold text-primary-800">{sequence}</span><div className="min-w-0 flex-1"><p className="text-sm leading-6 text-secondary-900">{question.prompt}</p><ul className="mt-3 grid gap-2">{question.options.map((option) => <OptionReview isSubmitted={isSubmitted} key={option.id} option={option} selected={option.id === question.selectedOptionId} />)}</ul>{isSubmitted && question.explanation ? <p className="mt-3 text-sm leading-6 text-secondary-600">{question.explanation}</p> : null}</div></div></li>;
}

function OptionReview({ isSubmitted, option, selected }: { isSubmitted: boolean; option: Submission["questions"][number]["options"][number]; selected: boolean }) {
  const isCorrect = option.correct;
  return <li className={cn("flex gap-2 rounded-xl px-3 py-2 text-sm", isSubmitted && isCorrect ? "bg-primary-50 text-primary-900" : selected ? "bg-accent-200 text-secondary-900" : "bg-secondary-50 text-secondary-700")}><span className="font-semibold">{option.key}.</span><span>{option.text}</span>{isCorrect ? <Check aria-label="Jawaban benar" className="ml-auto size-4 shrink-0 text-primary-700" /> : null}{selected && !isSubmitted ? <span className="ml-auto shrink-0 text-xs font-semibold text-secondary-600">Dipilih siswa</span> : null}{selected && isSubmitted && !isCorrect ? <span className="ml-auto shrink-0 text-xs font-semibold text-secondary-600">Dipilih siswa</span> : null}</li>;
}

export { KaptenQuizSubmissionPageModule };

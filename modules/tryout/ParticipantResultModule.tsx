"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  CircleNotch,
  Clock,
  Flag,
  GraduationCap,
  Printer,
  SpinnerGap,
  Target,
  TrendUp,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { House, RefreshCw } from "@/lib/icons";
import {
  AssessmentResultNavigation,
  AssessmentResultWorkspace,
  AssessmentUtilityPill,
} from "@/modules/assessment/AssessmentWorkspace";
import { cn } from "@/lib/utils";
import { participantTryoutResultAction } from "./participant-actions";

type ReviewItem = {
  difficulty: string;
  explanation: string;
  options: Array<{ choiceKey: string; content: string; correct: boolean | undefined; id: string }>;
  prompt: string;
  selectedOptionId: string | null;
};
type Calculation = {
  answeredCount?: number;
  correctCount?: number;
  deliveredCount?: number;
  maxScore?: number;
  normalizedScore?: number;
  score?: number;
  unansweredCount?: number;
  wrongCount?: number;
};
type ResultRun = {
  calculation: Calculation | null;
  durationSeconds: number;
  review: ReviewItem[];
  sectionTitle: string;
  subtest: string;
  subtestName: string;
  testType: string;
  timeSpentSeconds: number | null;
};
type Result =
  | { attemptId: string; policy: string; released: false; status: string }
  | {
      attemptId: string;
      finalScore: number;
      policy: string;
      ranking: { provisional: boolean; rank: number | null; rule: string; state: "available" | "unavailable"; total: number };
      released: true;
      runs: ResultRun[];
      target: { major: string | null; university: string | null };
      tryoutTitle: string;
    };

const courseSlugBySubtest: Record<string, string> = {
  LBE: "literasi-bahasa-inggris",
  LBI: "literasi-bahasa-indonesia",
  PBM: "pemahaman-bacaan-menulis",
  PK: "pengetahuan-kuantitatif",
  PM: "penalaran-matematika",
  PPU: "pengetahuan-pemahaman-umum",
  PU: "penalaran-umum",
};

function courseHref(subtest: string) {
  const slug = courseSlugBySubtest[subtest];
  return slug ? `/courses/${slug}` : "/courses";
}

function itemState(item: ReviewItem) {
  if (!item.selectedOptionId) return "blank" as const;
  return item.options.find((option) => option.id === item.selectedOptionId)?.correct ? "correct" as const : "wrong" as const;
}

function formatTime(seconds: number) {
  if (seconds < 60) return `${seconds} detik`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}d` : `${minutes} menit`;
}

function ParticipantResultModule({ attemptId }: { attemptId: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState("Memuat hasil tryout…");
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [reportedQuestions, setReportedQuestions] = useState<number[]>([]);

  const load = useCallback(async () => {
    setMessage("Memuat hasil tryout…");
    const response = await participantTryoutResultAction(attemptId);
    if (!response.ok) {
      setMessage(response.message);
      return;
    }
    setResult(response.result as Result);
    setMessage("");
  }, [attemptId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!result) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-secondary-50 px-5">
        <div className="w-full max-w-2xl text-center">
          <CircleNotch className="mx-auto animate-spin text-5xl text-primary-700" />
          <h1 className="mt-5 font-heading text-3xl font-semibold tracking-[-0.035em]">Menyiapkan paket hasilmu</h1>
          <p className="mt-3 text-secondary-600">{message}</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {["Memeriksa jawaban", "Menghitung skor", "Menyusun analisis"].map((label, index) => (
              <div className="rounded-2xl border border-primary-100 bg-white p-4" key={label}>
                {index === 2 ? <SpinnerGap className="mx-auto animate-spin text-primary-700" /> : <Check className="mx-auto text-primary-700" />}
                <p className="mt-2 text-sm font-semibold">{label}</p>
              </div>
            ))}
          </div>
          <Button className="mt-6" onClick={() => void load()} variant="brandOutline">Coba lagi</Button>
        </div>
      </main>
    );
  }

  if (!result.released) {
    return (
      <main className="min-h-svh bg-secondary-50 px-5 py-14">
        <div className="mx-auto max-w-2xl rounded-[2rem] border border-primary-100 bg-white p-7 text-center sm:p-10">
          <Clock className="mx-auto text-5xl text-primary-700" />
          <p className="mt-5 text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">Hasil tersimpan</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.035em]">Hasil belum dibuka</h1>
          <p className="mt-3 text-sm leading-6 text-secondary-600">{result.status}</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button onClick={() => void load()} variant="brand">Periksa lagi</Button>
            <Button aria-label="Kembali ke tryout" nativeButton={false} render={<Link href="/tryout" />} size="icon" title="Kembali ke tryout" variant="brandOutline"><ArrowLeft /></Button>
          </div>
        </div>
      </main>
    );
  }

  const reviewItems = result.runs.flatMap((run) => run.review.map((item) => ({ ...item, sectionTitle: run.sectionTitle, subtest: run.subtest, subtestName: run.subtestName })));
  const correctCount = reviewItems.filter((item) => itemState(item) === "correct").length;
  const wrongCount = reviewItems.filter((item) => itemState(item) === "wrong").length;
  const blankCount = reviewItems.filter((item) => itemState(item) === "blank").length;
  const totalTime = result.runs.reduce((sum, run) => sum + (run.timeSpentSeconds ?? 0), 0);
  const metrics = { accuracy: correctCount + wrongCount ? Math.round((correctCount / (correctCount + wrongCount)) * 100) : 0, blank: blankCount, correct: correctCount, total: reviewItems.length, totalTime, wrong: wrongCount };
  const runMetrics = result.runs.map((run) => {
    const correct = run.review.filter((item) => itemState(item) === "correct").length;
    const wrong = run.review.filter((item) => itemState(item) === "wrong").length;
    const blank = run.review.filter((item) => itemState(item) === "blank").length;
    const answered = run.calculation?.answeredCount ?? correct + wrong;
    return {
      ...run,
      accuracy: answered ? Math.round((correct / answered) * 100) : 0,
      blank,
      correct,
      wrong,
    };
  });
  const weakRuns = [...runMetrics].sort((left, right) => left.accuracy - right.accuracy).slice(0, 3);
  const targetLabel = [result.target.university, result.target.major].filter(Boolean).join(" · ") || "Belum diatur";
  const rankingLabel = result.ranking.state === "available" && result.ranking.rank !== null
    ? `#${result.ranking.rank} / ${result.ranking.total}`
    : "Belum tersedia";
  const rankingScope = result.ranking.rule === "cohort" ? "peringkat kelompok" : "peringkat nasional";
  const question = reviewItems[currentQuestion - 1];

  if (!question) {
    return <main className="p-8"><p role="alert">Belum ada soal yang dapat direview.</p></main>;
  }

  const selectedOption = question.options.find((option) => option.id === question.selectedOptionId);
  const correctOption = question.options.find((option) => option.correct);
  const state = itemState(question);
  const toggleReport = () => {
    setReportedQuestions((current) => current.includes(currentQuestion)
      ? current.filter((number) => number !== currentQuestion)
      : [...current, currentQuestion]);
  };
  const markers = reviewItems.map((item, index) => ({
    id: `${item.subtest}-${index}`,
    number: index + 1,
    state: index + 1 === currentQuestion
      ? "current"
      : itemState(item) === "correct"
        ? "correct"
        : itemState(item) === "wrong"
          ? "incorrect"
          : "unanswered",
  } as const));

  return (
    <AssessmentResultWorkspace
      headerActions={
        <>
          <Button className="hidden sm:inline-flex" nativeButton={false} render={<Link href="/tryout" />} variant="brandOutline"><RefreshCw />Ulangi</Button>
          <Button aria-label="Kembali ke menu tryout" className="hidden sm:inline-flex" nativeButton={false} render={<Link href="/tryout" />} title="Kembali ke menu tryout" variant="brand"><House />Menu</Button>
        </>
      }
      navigation={<AssessmentResultNavigation items={markers} label="Ringkasan soal" onSelect={setCurrentQuestion} />}
      score={result.finalScore}
      scoreLabel="Skor Akhir"
      summary={
        <div className="space-y-3 text-left">
          <div className="flex items-start gap-2 text-sm text-secondary-600"><Target className="mt-0.5 size-4 shrink-0 text-primary-700" /><span>{targetLabel}</span></div>
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            <ResultStat label="Benar" value={`${metrics.correct}`} />
            <ResultStat label="Salah" value={`${metrics.wrong}`} />
            <ResultStat label="Kosong" value={`${metrics.blank}`} />
            <ResultStat label="Akurasi" value={`${metrics.accuracy}%`} />
            <ResultStat label="Rata-rata" value={formatTime(metrics.total ? Math.round(metrics.totalTime / metrics.total) : 0)} />
            <ResultStat label={rankingScope} value={rankingLabel} />
          </div>
          {result.ranking.provisional ? <p className="text-xs text-student-status-attention-fg">Peringkat sementara hingga sesi ditutup.</p> : null}
        </div>
      }
      title={result.tryoutTitle}
    >
      <div className="space-y-5">
        <article className="rounded-[1.75rem] border border-primary-100 bg-white p-5 shadow-[0_20px_48px_-36px_rgba(1,76,56,0.55)] sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary-100 pb-5">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-secondary-900">Soal #{currentQuestion}</p>
            <span className="sr-only">{question.subtestName} · {question.sectionTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <AssessmentUtilityPill active={reportedQuestions.includes(currentQuestion)} icon={Flag} label="Laporkan soal" onClick={toggleReport} />
            <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold", state === "correct" ? "bg-student-status-success-bg text-student-status-success-fg" : state === "wrong" ? "bg-student-status-danger-bg text-student-status-danger-fg" : "bg-student-status-attention-bg text-student-status-attention-fg")}>
              {state === "correct" ? <CheckCircle className="size-4" /> : state === "wrong" ? <X className="size-4" /> : <Clock className="size-4" />}
              {state === "correct" ? "Benar" : state === "wrong" ? "Salah" : "Tidak dijawab"}
            </span>
          </div>
        </div>

        <p className="mt-6 whitespace-pre-wrap text-lg font-medium leading-[1.85] text-secondary-900 sm:text-xl">{question.prompt}</p>

        <div className="mt-7 grid gap-3">
          {question.options.map((option) => (
            <ReviewAnswerOption key={option.id} option={option} selected={option.id === question.selectedOptionId} />
          ))}
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg p-4">
            <p className="font-semibold text-student-status-danger-fg">Jawaban Anda</p>
            <p className="mt-2 font-medium text-secondary-900">{selectedOption ? `${selectedOption.choiceKey}. ${selectedOption.content}` : "Tidak dijawab"}</p>
          </div>
          <div className="rounded-2xl border border-student-status-success-border bg-student-status-success-bg p-4">
            <p className="font-semibold text-student-status-success-fg">Jawaban Benar</p>
            <p className="mt-2 font-medium text-secondary-900">{correctOption ? `${correctOption.choiceKey}. ${correctOption.content}` : "—"}</p>
          </div>
        </div>

        <section aria-label="Pembahasan" className="mt-7 border-t border-primary-100 pt-6">
          <h2 className="text-lg font-semibold text-secondary-900">Pembahasan</h2>
          <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-secondary-700">{question.explanation || "Pembahasan untuk soal ini belum tersedia."}</p>
        </section>

        <div className="mt-7 flex items-center justify-between gap-3 border-t border-primary-100 pt-5 print:hidden">
          <Button disabled={currentQuestion === 1} onClick={() => setCurrentQuestion((number) => number - 1)} variant="brandOutline"><ArrowLeft /><span className="hidden sm:inline">Sebelumnya</span></Button>
          {currentQuestion < reviewItems.length ? <Button onClick={() => setCurrentQuestion((number) => number + 1)} variant="brand"><span className="hidden sm:inline">Selanjutnya</span><ArrowRight /></Button> : <Button onClick={() => window.print()} variant="brandOutline"><Printer /><span className="hidden sm:inline">Cetak laporan</span></Button>}
        </div>
        </article>

        <section className="rounded-[1.75rem] border border-primary-100 bg-white p-5 shadow-[0_20px_48px_-36px_rgba(1,76,56,0.55)] sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-primary-100 pb-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-primary-700 uppercase"><TrendUp className="size-4" />Performa subtes</p>
              <h2 className="mt-2 text-xl font-semibold text-secondary-900">Peta hasil per bagian</h2>
            </div>
            <p className="text-xs text-secondary-500">Indeks dan akurasi untuk evaluasi Vecalss</p>
          </div>
          <div className="mt-5 grid gap-5">
            {runMetrics.map((run) => {
              const normalizedScore = run.calculation?.normalizedScore;
              return (
                <article key={`${run.subtest}-${run.sectionTitle}`}>
                  <div className="flex items-end justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{run.subtest}</h3>
                      <p className="mt-1 text-xs text-secondary-500">{run.subtestName} · {run.testType.toUpperCase()}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-lg font-semibold">{typeof normalizedScore === "number" ? normalizedScore.toFixed(2) : "—"}</p>
                      <p className="text-xs text-secondary-500">indeks · {run.accuracy}% akurasi</p>
                    </div>
                  </div>
                  <div aria-label={`Akurasi ${run.subtest} ${run.accuracy} persen`} className="mt-3 h-2 overflow-hidden rounded-full bg-secondary-100" role="img">
                    <div className="h-full rounded-full bg-primary-700" style={{ width: `${run.accuracy}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-secondary-500">
                    {run.correct} benar · {run.wrong} salah · {run.blank} kosong
                    {run.timeSpentSeconds !== null ? ` · ${formatTime(run.timeSpentSeconds)}` : ""}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-primary-100 bg-white p-5 shadow-[0_20px_48px_-36px_rgba(1,76,56,0.55)] sm:p-7">
          <div className="flex items-center gap-3">
            <GraduationCap className="size-5 text-primary-700" />
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">Fokus berikutnya</p>
              <h2 className="mt-1 text-xl font-semibold text-secondary-900">Subtes yang perlu dikuatkan</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {weakRuns.map((run, index) => (
              <Link
                className="group flex min-h-16 items-center gap-3 rounded-2xl bg-primary-50 p-3 outline-none transition-colors hover:bg-primary-100 focus-visible:ring-4 focus-visible:ring-primary-700/20"
                href={courseHref(run.subtest)}
                key={run.subtest}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-primary-800">{index + 1}</span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{run.subtestName}</strong><span className="text-xs text-secondary-500">Akurasi {run.accuracy}% · buka materi</span></span>
                <ArrowRight className="shrink-0 text-primary-700 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AssessmentResultWorkspace>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-primary-100 bg-secondary-50 px-3 py-3"><p className="text-xs font-medium text-secondary-500">{label}</p><p className="mt-1 text-xl font-semibold text-secondary-900">{value}</p></div>;
}

function ReviewAnswerOption({
  option,
  selected,
}: {
  option: { choiceKey: string; content: string; correct: boolean | undefined; id: string };
  selected: boolean;
}) {
  const isIncorrectSelection = selected && option.correct !== true;
  return (
    <div className={cn("flex items-start gap-4 rounded-3xl border px-4 py-4 sm:px-5", option.correct === true && "border-student-status-success-border bg-student-status-success-bg", isIncorrectSelection && "border-student-status-danger-border bg-student-status-danger-bg", option.correct !== true && !isIncorrectSelection && "border-primary-100 bg-white")}>
      <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold", option.correct === true && "border-student-status-success-solid-bg bg-student-status-success-solid-bg text-student-status-success-solid-fg", isIncorrectSelection && "border-student-status-danger-solid-bg bg-student-status-danger-solid-bg text-student-status-danger-solid-fg", option.correct !== true && !isIncorrectSelection && "border-secondary-200 bg-secondary-50 text-secondary-500")}>
        {option.correct === true ? <Check className="size-5" /> : option.choiceKey}
      </span>
      <p className="min-w-0 flex-1 text-lg leading-[1.8] font-medium text-secondary-800">{option.content}</p>
    </div>
  );
}

export { ParticipantResultModule };

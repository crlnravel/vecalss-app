"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  CircleAlert,
  Flag,
  GraduationCap,
  Printer,
  Target,
  TrendUp,
  X,
} from "@/lib/icons";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { TypedRouteState } from "@/components/ui/typed-route-state";
import { House, RefreshCw } from "@/lib/icons";
import {
  AssessmentResultNavigation,
  AssessmentResultWorkspace,
  AssessmentUtilityPill,
} from "@/modules/assessment/AssessmentWorkspace";
import { AssessmentReviewAnswerOption } from "@/modules/assessment/AssessmentReviewAnswerOption";
import { AssessmentResultStat } from "@/modules/assessment/AssessmentResultStat";
import { cn } from "@/lib/utils";
import { compareSelectedOptionSets } from "@/lib/question-bank/answer-contract";
import { unstable_rethrow } from "next/navigation";
import { participantTryoutResultAction } from "./participant-actions";

type ReviewItem = {
  difficulty: string;
  explanation: string;
  options: Array<{ choiceKey: string; content: string; correct: boolean | undefined; id: string }>;
  prompt: string;
  selectedOptionId: string | null;
  selectedOptionIds?: string[];
  questionType?: "single_choice" | "multiple_choice";
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
  const selectedOptionIds = item.selectedOptionIds?.length
    ? item.selectedOptionIds
    : item.selectedOptionId
      ? [item.selectedOptionId]
      : [];
  if (!selectedOptionIds.length) return "blank" as const;
  const correctOptionIds = item.options.filter((option) => option.correct).map((option) => option.id);
  return compareSelectedOptionSets(selectedOptionIds, correctOptionIds).equal ? "correct" as const : "wrong" as const;
}

function formatTime(seconds: number) {
  if (seconds < 60) return `${seconds} detik`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} menit ${rest} detik` : `${minutes} menit`;
}

type ReleasedResult = Extract<Result, { released: true }>;
type ResultRunMetric = ResultRun & { accuracy: number; blank: number; correct: number; wrong: number };
type ReviewItemWithContext = ReviewItem & { sectionTitle: string; subtest: string; subtestName: string };
type ParticipantResultModel = {
  blankCount: number;
  correctCount: number;
  metrics: { accuracy: number; blank: number; correct: number; total: number; totalTime: number; wrong: number };
  question: ReviewItemWithContext | undefined;
  rankingLabel: string;
  rankingScope: string;
  reviewItems: ReviewItemWithContext[];
  runMetrics: ResultRunMetric[];
  targetLabel: string;
  weakRuns: ResultRunMetric[];
};

function getParticipantResultModel(result: ReleasedResult, currentQuestion: number): ParticipantResultModel {
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
    return { ...run, accuracy: answered ? Math.round((correct / answered) * 100) : 0, blank, correct, wrong };
  });
  const rankingLabel = result.ranking.rule === "none"
    ? "Tidak digunakan"
    : result.ranking.state === "available" && result.ranking.rank !== null
      ? `#${result.ranking.rank} / ${result.ranking.total}`
      : "Belum tersedia";
  const rankingScope = result.ranking.rule === "cohort"
    ? "Peringkat kelompok"
    : result.ranking.rule === "none"
      ? "Peringkat"
      : "Peringkat nasional";

  return {
    blankCount,
    correctCount,
    metrics,
    question: reviewItems[currentQuestion - 1],
    rankingLabel,
    rankingScope,
    reviewItems,
    runMetrics,
    targetLabel: [result.target.university, result.target.major].filter(Boolean).join(" · ") || "Belum diatur",
    weakRuns: [...runMetrics].sort((left, right) => left.accuracy - right.accuracy).slice(0, 3),
  };
}

function useParticipantResultLoader(attemptId: string) {
  const [result, setResult] = useState<Result | null>(null);
  const [loadState, setLoadState] = useState<"error" | "loading" | "ready">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const response = await participantTryoutResultAction(attemptId);
      if (!response.ok) {
        setLoadState("error");
        setLoadError(response.message);
        return;
      }
      setResult(response.result as Result);
      setLoadState("ready");
      setLoadError(null);
    } catch (loadResultError) {
      unstable_rethrow(loadResultError);
      setLoadState("error");
      setLoadError("Hasil Tryout belum berhasil dimuat. Periksa koneksi lalu coba lagi.");
    }
  }, [attemptId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return { load, loadError, loadState, result };
}

function ParticipantResultLoadState({
  load,
  loadError,
  loadState,
  safeReturnHref,
}: {
  load: () => Promise<void>;
  loadError: string | null;
  loadState: "error" | "loading" | "ready";
  safeReturnHref: string;
}) {
  if (loadState === "error") {
    return <TypedRouteState className="student-page-canvas" context="Data pengerjaan tetap ada saat kamu mencoba lagi." description={loadError ?? "Hasil Tryout belum berhasil dimuat. Periksa koneksi lalu coba lagi."} kind="error" onRetry={() => void load()} returnHref={safeReturnHref} returnLabel="Kembali ke Tryout" title="Hasil Tryout belum dapat dimuat" />;
  }

  return <TypedRouteState className="student-page-canvas" description="Memeriksa hasil percobaan Tryout dari server. Hasil belum dianggap tersedia sebelum pemeriksaan selesai." kind="loading" title="Menyiapkan hasil Tryout" />;
}

function ParticipantResultPendingState({ load, safeReturnHref, status }: { load: () => Promise<void>; safeReturnHref: string; status: string }) {
  return <main className="student-page-canvas min-h-svh px-5 py-14"><div className="mx-auto max-w-2xl rounded-[2rem] border border-primary-100 bg-white p-7 text-center sm:p-10"><Clock className="mx-auto text-5xl text-primary-700" /><p className="mt-5 text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">Hasil tersimpan</p><h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.035em]">Hasil belum dibuka</h1><p className="mt-3 text-sm leading-6 text-secondary-600">{status}</p><div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><Button onClick={() => void load()} variant="brand">Periksa lagi</Button><BackButton href={safeReturnHref} label="Kembali ke Tryout" variant="brandOutline"><ArrowLeft /></BackButton></div></div></main>;
}

function ParticipantResultSummary({ model, result }: { model: ParticipantResultModel; result: ReleasedResult }) {
  return <div className="space-y-3 text-left"><div className="flex items-start gap-2 text-sm text-secondary-600"><Target className="mt-0.5 size-4 shrink-0 text-primary-700" /><span>{model.targetLabel}</span></div><div className="grid grid-cols-3 gap-2 lg:grid-cols-1"><AssessmentResultStat label="Benar" value={`${model.metrics.correct}`} /><AssessmentResultStat label="Salah" value={`${model.metrics.wrong}`} /><AssessmentResultStat label="Kosong" value={`${model.metrics.blank}`} /><AssessmentResultStat label="Akurasi" value={`${model.metrics.accuracy}%`} /><AssessmentResultStat label="Rata-rata" value={formatTime(model.metrics.total ? Math.round(model.metrics.totalTime / model.metrics.total) : 0)} /><AssessmentResultStat label={model.rankingScope} value={model.rankingLabel} /></div><p className="text-xs leading-5 text-secondary-500">Skor ini untuk latihan dan bukan nilai resmi SNBT.</p>{result.ranking.provisional ? <p className="text-xs text-student-status-attention-fg">Peringkat sementara hingga sesi ditutup.</p> : null}</div>;
}

function getParticipantResultNavigationItems(reviewItems: ParticipantResultModel["reviewItems"], currentQuestion: number) {
  return reviewItems.map((item, index) => {
    const state = itemState(item);
    const outcome = state === "correct" ? "correct" : state === "wrong" ? "incorrect" : "unanswered";
    return { id: `${item.subtest}-${index}`, number: index + 1, outcome, state: index + 1 === currentQuestion ? "current" : outcome } as const;
  });
}

function getResultQuestionStatus(state: ReturnType<typeof itemState>) {
  if (state === "correct") return { className: "bg-student-status-success-bg text-student-status-success-fg", icon: CheckCircle2, label: "Benar" };
  if (state === "wrong") return { className: "bg-student-status-danger-bg text-student-status-danger-fg", icon: X, label: "Salah" };
  return { className: "bg-student-status-attention-bg text-student-status-attention-fg", icon: Clock, label: "Tidak dijawab" };
}

function getResultAnswerTone(state: ReturnType<typeof itemState>) {
  if (state === "correct") return { container: "border-student-status-success-border bg-student-status-success-bg", label: "text-student-status-success-fg" };
  if (state === "wrong") return { container: "border-student-status-danger-border bg-student-status-danger-bg", label: "text-student-status-danger-fg" };
  return { container: "border-student-status-attention-border bg-student-status-attention-bg", label: "text-student-status-attention-fg" };
}

function ParticipantResultQuestionReview({
  currentQuestion,
  onNext,
  onPrevious,
  onPrint,
  onToggleReport,
  question,
  questionCount,
  reportedQuestions,
}: {
  currentQuestion: number;
  onNext: () => void;
  onPrevious: () => void;
  onPrint: () => void;
  onToggleReport: () => void;
  question: ReviewItemWithContext;
  questionCount: number;
  reportedQuestions: number[];
}) {
  const selectedOptionIds = question.selectedOptionIds?.length
    ? question.selectedOptionIds
    : question.selectedOptionId
      ? [question.selectedOptionId]
      : [];
  const selectedOptionIdSet = new Set(selectedOptionIds);
  const selectedOptions = question.options.filter((option) => selectedOptionIdSet.has(option.id));
  const correctOptions = question.options.filter((option) => option.correct);
  const state = itemState(question);
  const status = getResultQuestionStatus(state);
  const StatusIcon = status.icon;
  const selectedAnswerTone = getResultAnswerTone(state);

  return <article className="rounded-[1.75rem] border border-primary-100 bg-white p-5 shadow-[0_20px_48px_-36px_color-mix(in_oklab,var(--voyage-deep)_55%,transparent)] sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary-100 pb-5"><div className="min-w-0"><p className="text-lg font-semibold text-secondary-900">Soal #{currentQuestion}</p><span className="sr-only">{question.subtestName} · {question.sectionTitle}</span></div><div className="flex items-center gap-2"><AssessmentUtilityPill active={reportedQuestions.includes(currentQuestion)} icon={Flag} label="Laporkan soal" onClick={onToggleReport} /><span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold", status.className)}><StatusIcon className="size-4" />{status.label}</span></div></div><p className="mt-6 whitespace-pre-wrap text-lg font-medium leading-[1.85] text-secondary-900 sm:text-xl">{question.prompt}</p><div className="mt-7 grid gap-3">{question.options.map((option) => <AssessmentReviewAnswerOption correct={option.correct === true} key={option.id} label={option.choiceKey} selected={selectedOptionIdSet.has(option.id)} text={option.content} />)}</div><div className="mt-7 grid gap-3 sm:grid-cols-2"><div className={cn("rounded-2xl border p-4", selectedAnswerTone.container)}><p className={cn("font-semibold", selectedAnswerTone.label)}>Jawaban Anda</p><p className="mt-2 font-medium text-secondary-900">{selectedOptions.length ? selectedOptions.map((option) => `${option.choiceKey}. ${option.content}`).join(" · ") : "Tidak dijawab"}</p></div><div className="rounded-2xl border border-student-status-success-border bg-student-status-success-bg p-4"><p className="font-semibold text-student-status-success-fg">Jawaban Benar</p><p className="mt-2 font-medium text-secondary-900">{correctOptions.length ? correctOptions.map((option) => `${option.choiceKey}. ${option.content}`).join(" · ") : "—"}</p></div></div><section aria-label="Pembahasan" className="mt-7 border-t border-primary-100 pt-6"><h2 className="text-lg font-semibold text-secondary-900">Pembahasan</h2><p className="mt-3 whitespace-pre-wrap text-base leading-7 text-secondary-700">{question.explanation || "Pembahasan untuk soal ini belum tersedia."}</p></section><div className="mt-7 flex items-center justify-between gap-3 border-t border-primary-100 pt-5 print:hidden"><Button disabled={currentQuestion === 1} onClick={onPrevious} variant="brandOutline"><ArrowLeft /><span className="hidden sm:inline">Sebelumnya</span></Button>{currentQuestion < questionCount ? <Button onClick={onNext} variant="brand"><span className="hidden sm:inline">Selanjutnya</span><ArrowRight /></Button> : <Button onClick={onPrint} variant="brandOutline"><Printer /><span className="hidden sm:inline">Cetak laporan</span></Button>}</div></article>;
}

function ParticipantResultReviewPanel({
  model,
  safeReturnHref,
  ...props
}: {
  model: ParticipantResultModel;
  safeReturnHref: string;
  currentQuestion: number;
  onNext: () => void;
  onPrevious: () => void;
  onPrint: () => void;
  onToggleReport: () => void;
  reportedQuestions: number[];
}) {
  if (!model.question) {
    return <main className="student-page-canvas flex min-h-svh items-center justify-center px-5 py-10"><section className="w-full max-w-xl rounded-[2rem] border border-primary-100 bg-white p-7 text-center shadow-[0_20px_48px_-36px_color-mix(in_oklab,var(--voyage-deep)_55%,transparent)] sm:p-10" role="status"><CircleAlert aria-hidden="true" className="mx-auto size-12 text-student-status-attention-fg" /><h1 className="mt-5 font-heading text-2xl font-semibold tracking-[-0.035em] text-secondary-900">Belum ada soal untuk ditinjau</h1><p className="mt-3 text-sm leading-6 text-secondary-600">Belum ada soal yang dapat ditinjau dari paket hasil ini. Kembali ke menu Tryout untuk melihat aktivitas lain.</p><Button className="mt-6" nativeButton={false} render={<Link href={safeReturnHref} />} variant="brand"><ArrowLeft />Kembali ke Tryout</Button></section></main>;
  }
  return <ParticipantResultQuestionReview {...props} currentQuestion={props.currentQuestion} onNext={props.onNext} onPrevious={props.onPrevious} onPrint={props.onPrint} onToggleReport={props.onToggleReport} question={model.question} questionCount={model.reviewItems.length} reportedQuestions={props.reportedQuestions} />;
}

function ParticipantResultPerformance({ runMetrics }: { runMetrics: ResultRunMetric[] }) {
  return <section className="rounded-[1.75rem] border border-primary-100 bg-white p-5 shadow-[0_20px_48px_-36px_color-mix(in_oklab,var(--voyage-deep)_55%,transparent)] sm:p-7"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-primary-100 pb-4"><div><p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-primary-700 uppercase"><TrendUp className="size-4" />Performa subtes</p><h2 className="mt-2 text-xl font-semibold text-secondary-900">Peta hasil per bagian</h2></div><p className="text-xs text-secondary-500">Indeks dan akurasi untuk evaluasi Vecalss</p></div><div className="mt-5 grid gap-5">{runMetrics.map((run) => { const normalizedScore = run.calculation?.normalizedScore; return <article key={`${run.subtest}-${run.sectionTitle}`}><div className="flex items-end justify-between gap-4"><div className="min-w-0"><h3 className="font-semibold">{run.subtest}</h3><p className="mt-1 text-xs text-secondary-500">{run.subtestName} · {run.testType.toUpperCase()}</p></div><div className="shrink-0 text-right"><p className="font-mono text-lg font-semibold">{typeof normalizedScore === "number" ? normalizedScore.toFixed(2) : "—"}</p><p className="text-xs text-secondary-500">indeks · {run.accuracy}% akurasi</p></div></div><div aria-label={`Akurasi ${run.subtest} ${run.accuracy} persen`} className="mt-3 h-2 overflow-hidden rounded-full bg-secondary-100" role="img"><div className="h-full rounded-full bg-primary-700" style={{ width: `${run.accuracy}%` }} /></div><p className="mt-2 text-xs text-secondary-500">{run.correct} benar · {run.wrong} salah · {run.blank} kosong{run.timeSpentSeconds !== null ? ` · ${formatTime(run.timeSpentSeconds)}` : ""}</p></article>; })}</div></section>;
}

function ParticipantResultFocus({ weakRuns }: { weakRuns: ResultRunMetric[] }) {
  return <section className="rounded-[1.75rem] border border-primary-100 bg-white p-5 shadow-[0_20px_48px_-36px_color-mix(in_oklab,var(--voyage-deep)_55%,transparent)] sm:p-7"><div className="flex items-center gap-3"><GraduationCap className="size-5 text-primary-700" /><div><p className="text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">Fokus berikutnya</p><h2 className="mt-1 text-xl font-semibold text-secondary-900">Subtes yang perlu dikuatkan</h2></div></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{weakRuns.map((run, index) => <Link className="group flex min-h-16 items-center gap-3 rounded-2xl bg-primary-50 p-3 outline-none transition-colors motion-reduce:transition-none hover:bg-primary-100 focus-visible:ring-4 focus-visible:ring-primary-700/20" href={courseHref(run.subtest)} key={run.subtest}><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-primary-800">{index + 1}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{run.subtestName}</strong><span className="text-xs text-secondary-500">Akurasi {run.accuracy}% · buka materi</span></span><ArrowRight className="shrink-0 text-primary-700 transition-transform motion-safe:group-hover:translate-x-0.5 motion-reduce:translate-x-0 motion-reduce:transition-none" /></Link>)}</div></section>;
}

function ParticipantReleasedResult({ result, safeReturnHref }: { result: ReleasedResult; safeReturnHref: string }) {
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [reportedQuestions, setReportedQuestions] = useState<number[]>([]);
  const model = getParticipantResultModel(result, currentQuestion);

  const toggleReport = () => setReportedQuestions((current) => current.includes(currentQuestion) ? current.filter((number) => number !== currentQuestion) : [...current, currentQuestion]);
  const reviewProps = {
    currentQuestion,
    onNext: () => setCurrentQuestion((number) => number + 1),
    onPrevious: () => setCurrentQuestion((number) => number - 1),
    onPrint: () => window.print(),
    onToggleReport: toggleReport,
    reportedQuestions,
  };
  return <AssessmentResultWorkspace headerActions={<><Button className="hidden sm:inline-flex" nativeButton={false} render={<Link href={safeReturnHref} />} variant="brandOutline"><RefreshCw />Lihat daftar Tryout</Button><Button aria-label="Kembali ke menu Tryout" className="hidden sm:inline-flex" nativeButton={false} render={<Link href={safeReturnHref} />} title="Kembali ke menu Tryout" variant="brand"><House />Menu</Button></>} navigation={<AssessmentResultNavigation items={getParticipantResultNavigationItems(model.reviewItems, currentQuestion)} label="Ringkasan soal" onSelect={setCurrentQuestion} />} score={result.finalScore} scoreLabel="Skor Akhir" summary={<ParticipantResultSummary model={model} result={result} />} title={result.tryoutTitle}><div className="space-y-5"><ParticipantResultReviewPanel model={model} safeReturnHref={safeReturnHref} {...reviewProps} /><ParticipantResultPerformance runMetrics={model.runMetrics} /><ParticipantResultFocus weakRuns={model.weakRuns} /></div></AssessmentResultWorkspace>;
}

function ParticipantResultModule({ attemptId, returnToHref, sessionId }: { attemptId: string; returnToHref?: string; sessionId?: string }) {
  const { load, loadError, loadState, result } = useParticipantResultLoader(attemptId);
  const safeReturnHref = returnToHref ?? (sessionId ? `/tryout?session=${encodeURIComponent(sessionId)}` : "/tryout");

  if (!result) return <ParticipantResultLoadState load={load} loadError={loadError} loadState={loadState} safeReturnHref={safeReturnHref} />;
  if (!result.released) return <ParticipantResultPendingState load={load} safeReturnHref={safeReturnHref} status={result.status} />;
  return <ParticipantReleasedResult result={result} safeReturnHref={safeReturnHref} />;
}

export { ParticipantResultModule };

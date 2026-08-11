"use client";

import {
  ArrowRight,
  Check,
  CheckCircle,
  CircleNotch,
  Clock,
  FlagBanner,
  GraduationCap,
  Medal,
  Printer,
  SpinnerGap,
  Target,
  TrendUp,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { ChevronLeft } from "@/lib/icons";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
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

type ReviewFilter = "all" | "wrong" | "blank";

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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");

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

  const metrics = useMemo(() => {
    if (!result?.released) return null;
    const allItems = result.runs.flatMap((run) => run.review);
    const correct = allItems.filter((item) => itemState(item) === "correct").length;
    const wrong = allItems.filter((item) => itemState(item) === "wrong").length;
    const blank = allItems.filter((item) => itemState(item) === "blank").length;
    const totalTime = result.runs.reduce((sum, run) => sum + (run.timeSpentSeconds ?? 0), 0);
    const answered = correct + wrong;
    return {
      accuracy: answered ? Math.round((correct / answered) * 100) : 0,
      averageSeconds: allItems.length ? Math.round(totalTime / allItems.length) : 0,
      blank,
      correct,
      total: allItems.length,
      totalTime,
      wrong,
    };
  }, [result]);

  if (!result) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-[#f7faf8] px-5">
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
      <main className="min-h-svh bg-[#f7faf8] px-5 py-14">
        <div className="mx-auto max-w-2xl rounded-[2rem] border border-primary-100 bg-white p-7 text-center sm:p-10">
          <Clock className="mx-auto text-5xl text-primary-700" />
          <p className="mt-5 text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">Hasil tersimpan</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.035em]">Hasil belum dibuka</h1>
          <p className="mt-3 text-sm leading-6 text-secondary-600">{result.status}</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button onClick={() => void load()} variant="brand">Periksa lagi</Button>
            <Button
              aria-label="Kembali ke tryout"
              render={<Link href="/tryout" />}
              size="icon"
              title="Kembali ke tryout"
              variant="brandOutline"
            >
              <ChevronLeft />
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const runMetrics = result.runs.map((run) => {
    const correct = run.review.filter((item) => itemState(item) === "correct").length;
    const wrong = run.review.filter((item) => itemState(item) === "wrong").length;
    const blank = run.review.filter((item) => itemState(item) === "blank").length;
    return { ...run, accuracy: correct + wrong ? Math.round((correct / (correct + wrong)) * 100) : 0, blank, correct, wrong };
  });
  const weakRuns = [...runMetrics].sort((left, right) => left.accuracy - right.accuracy).slice(0, 3);
  const targetLabel = [result.target.university, result.target.major].filter(Boolean).join(" · ") || "Belum diatur";

  return (
    <main className="min-h-svh bg-[#f7faf8] px-4 py-7 text-secondary-900 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto grid max-w-6xl gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Button
            aria-label="Kembali ke tryout"
            render={<Link href="/tryout" />}
            size="icon"
            title="Kembali ke tryout"
            variant="ghost"
          >
            <ChevronLeft />
          </Button>
          <Button onClick={() => window.print()} variant="brandOutline"><Printer />Cetak laporan</Button>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-primary-900/10 bg-primary-900 text-white">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end lg:p-10">
            <div>
              <p className="text-xs font-bold tracking-[0.15em] text-primary-200 uppercase">Paket hasil · {result.tryoutTitle}</p>
              <h1 className="mt-4 font-heading text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Kerja bagus. Ini peta belajarmu.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-primary-100 sm:text-base">Indeks hasil ini menggabungkan tujuh subtes pada skala internal 0–100 untuk evaluasi Vecalss, bukan nilai resmi SNBT. Gunakan indeks dan akurasi per subtes bersama review jawaban untuk memilih latihan berikutnya.</p>
              <div className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 text-sm"><Target />{targetLabel}</div>
            </div>
            <div className="min-w-52 rounded-3xl bg-student-status-attention-solid-bg p-6 text-student-status-attention-solid-fg">
              <p className="text-xs font-bold tracking-[0.12em] uppercase">Indeks hasil</p>
              <p className="mt-2 font-mono text-6xl font-bold tracking-[-0.05em]">{result.finalScore.toFixed(2)}</p>
              <p className="mt-2 text-sm">skala internal 0–100 · {result.runs.length} subtes</p>
            </div>
          </div>
        </section>

        <section aria-label="Ringkasan hasil" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-3xl border border-primary-100 bg-white p-5"><p className="flex items-center gap-2 text-sm text-secondary-500"><TrendUp />Akurasi</p><p className="mt-3 font-mono text-3xl font-semibold">{metrics?.accuracy}%</p><p className="mt-1 text-xs text-secondary-500">dari soal yang dijawab</p></article>
          <article className="rounded-3xl border border-primary-100 bg-white p-5"><p className="flex items-center gap-2 text-sm text-secondary-500"><CheckCircle />Benar</p><p className="mt-3 font-mono text-3xl font-semibold text-primary-700">{metrics?.correct}</p><p className="mt-1 text-xs text-secondary-500">{metrics?.wrong} salah · {metrics?.blank} kosong</p></article>
          <article className="rounded-3xl border border-primary-100 bg-white p-5"><p className="flex items-center gap-2 text-sm text-secondary-500"><Clock />Rata-rata waktu</p><p className="mt-3 font-mono text-3xl font-semibold">{formatTime(metrics?.averageSeconds ?? 0)}</p><p className="mt-1 text-xs text-secondary-500">per soal terkirim</p></article>
          <article className="rounded-3xl border border-primary-100 bg-white p-5"><p className="flex items-center gap-2 text-sm text-secondary-500"><Medal />Peringkat {result.ranking.rule === "cohort" ? "kelompok" : "nasional"}</p><p className="mt-3 text-2xl font-semibold">{result.ranking.state === "available" ? `#${result.ranking.rank} / ${result.ranking.total}` : "Belum tersedia"}</p>{result.ranking.provisional ? <p className="mt-1 text-xs text-student-status-attention-fg">Sementara hingga sesi ditutup</p> : null}</article>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
          <div className="rounded-[2rem] border border-primary-100 bg-white p-6 sm:p-8">
            <p className="text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">Performa subtes</p>
            <h2 className="mt-2 font-heading text-2xl font-semibold tracking-[-0.025em]">Lihat pola, bukan hanya total</h2>
            <div className="mt-6 grid gap-5">
              {runMetrics.map((run) => (
                <article key={`${run.subtest}-${run.sectionTitle}`}>
                  <div className="flex items-end justify-between gap-4"><div><h3 className="font-semibold">{run.subtest}</h3><p className="mt-1 text-xs text-secondary-500">{run.subtestName} · {run.testType.toUpperCase()}</p></div><div className="text-right"><p className="font-mono text-lg font-semibold">{typeof run.calculation?.normalizedScore === "number" ? run.calculation.normalizedScore.toFixed(2) : "—"}</p><p className="text-xs text-secondary-500">indeks · {run.accuracy}% akurasi</p></div></div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary-100" role="img" aria-label={`Akurasi ${run.subtest} ${run.accuracy} persen`}><div className="h-full rounded-full bg-primary-700" style={{ width: `${run.accuracy}%` }} /></div>
                  <p className="mt-2 text-xs text-secondary-500">{run.correct} benar · {run.wrong} salah · {run.blank} kosong{run.timeSpentSeconds !== null ? ` · ${formatTime(run.timeSpentSeconds)}` : ""}</p>
                </article>
              ))}
            </div>
          </div>

          <aside className="grid gap-5">
            <section className="rounded-[2rem] border border-primary-100 bg-white p-6">
              <p className="text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">Fokus berikutnya</p>
              <h2 className="mt-2 font-heading text-xl font-semibold">Subtes yang perlu dikuatkan</h2>
              <ol className="mt-5 grid gap-3">
                {weakRuns.map((run, index) => (
                  <li key={run.subtest}>
                    <Link
                      className="group flex min-h-14 items-center gap-3 rounded-2xl bg-primary-50 p-3 outline-none transition-colors hover:bg-primary-100 focus-visible:ring-4 focus-visible:ring-primary-700/20"
                      href={courseHref(run.subtest)}
                    >
                      <span className="flex size-8 items-center justify-center rounded-full bg-white text-sm font-bold text-primary-800">{index + 1}</span>
                      <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{run.subtestName}</strong><span className="text-xs text-secondary-500">Akurasi {run.accuracy}% · buka materi</span></span>
                      <ArrowRight className="shrink-0 text-primary-700 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-[2rem] border border-primary-100 bg-white p-6">
              <p className="flex items-center gap-2 text-sm text-secondary-500"><GraduationCap />Target utama</p>
              <p className="mt-3 font-semibold">{targetLabel}</p>
              <p className="mt-2 text-xs leading-5 text-secondary-500">Gunakan hasil ini bersama data penerimaan terbaru saat menyusun strategi kampus.</p>
            </section>
          </aside>
        </section>

        <section className="rounded-[2rem] border border-primary-100 bg-white p-6 sm:p-8 print:hidden">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">Review jawaban</p><h2 className="mt-2 font-heading text-2xl font-semibold tracking-[-0.025em]">Pahami setiap keputusan</h2><p className="mt-2 text-sm text-secondary-600">Bandingkan jawabanmu dengan kunci dan penjelasan.</p></div>
            <Button onClick={() => setReviewOpen((open) => !open)} variant="brand">{reviewOpen ? "Tutup review" : "Buka review"}<ArrowRight /></Button>
          </div>

          {reviewOpen ? (
            <div className="mt-7 border-t border-primary-100 pt-6">
              <div aria-label="Filter review" className="flex flex-wrap gap-2" role="group">
                {(["all", "wrong", "blank"] as ReviewFilter[]).map((filter) => <Button aria-pressed={reviewFilter === filter} className="rounded-full" key={filter} onClick={() => setReviewFilter(filter)} variant={reviewFilter === filter ? "brand" : "context"}>{filter === "all" ? "Semua" : filter === "wrong" ? "Salah" : "Kosong"}</Button>)}
              </div>
              <div className="mt-6 grid gap-6">
                {result.runs.map((run) => {
                  const visibleItems = run.review.filter((item) => reviewFilter === "all" || itemState(item) === reviewFilter);
                  if (!visibleItems.length) return null;
                  return (
                    <section key={`${run.subtest}-review`}>
                      <h3 className="font-semibold">{run.subtest} · {run.subtestName}</h3>
                      <div className="mt-3 grid gap-3">
                        {visibleItems.map((item, itemIndex) => {
                          const state = itemState(item);
                          const selectedOption = item.options.find((option) => option.id === item.selectedOptionId);
                          const correctOption = item.options.find((option) => option.correct);
                          return (
                            <details className="group rounded-2xl border border-primary-100 bg-secondary-50 p-4 open:bg-white" key={`${run.subtest}-${itemIndex}`}>
                              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-primary-700/20 [&::-webkit-details-marker]:hidden">
                                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", state === "correct" ? "bg-student-status-success-bg text-student-status-success-fg" : state === "wrong" ? "bg-student-status-danger-bg text-student-status-danger-fg" : "bg-student-status-attention-bg text-student-status-attention-fg")}>{state === "correct" ? <Check /> : state === "wrong" ? <X /> : <FlagBanner />}</span>
                                <span className="line-clamp-2 flex-1 text-sm font-medium">{itemIndex + 1}. {item.prompt}</span>
                                <span className="text-xs font-semibold text-secondary-500">{state === "correct" ? "Benar" : state === "wrong" ? "Salah" : "Kosong"}</span>
                              </summary>
                              <div className="mt-4 grid gap-4 border-t border-primary-100 pt-4 text-sm leading-6">
                                <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-secondary-50 p-3"><p className="text-xs text-secondary-500">Jawabanmu</p><p className="mt-1 font-semibold">{selectedOption ? `${selectedOption.choiceKey}. ${selectedOption.content}` : "Tidak dijawab"}</p></div><div className="rounded-xl bg-primary-50 p-3"><p className="text-xs text-secondary-500">Jawaban benar</p><p className="mt-1 font-semibold">{correctOption ? `${correctOption.choiceKey}. ${correctOption.content}` : "—"}</p></div></div>
                                <div><p className="font-semibold">Penjelasan</p><p className="mt-1 whitespace-pre-wrap text-secondary-700">{item.explanation || "Penjelasan belum tersedia."}</p></div>
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>

        <div className="flex flex-col justify-between gap-3 sm:flex-row print:hidden">
          <Button
            aria-label="Kembali ke katalog"
            render={<Link href="/tryout" />}
            size="icon"
            title="Kembali ke katalog"
            variant="brandOutline"
          >
            <ChevronLeft />
          </Button>
          <Button render={<Link href="/courses" />} variant="brand">Lanjutkan belajar <ArrowRight /></Button>
        </div>
      </div>
    </main>
  );
}

export { ParticipantResultModule };

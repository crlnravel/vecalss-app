"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { startQuizAction } from "./actions";
import type { QuizItem } from "./data";

type QuizStartPolicy = {
  attemptsAllowed: number | null;
  correctAnswerVisibility: "show" | "hide";
  formBehavior: "same" | "fresh_randomized";
  retryDelaySeconds: number | null;
  reviewTiming: "immediate" | "after_close" | "never";
  scorePolicy: "highest" | "latest" | "first" | "average";
};

function QuizStartPageModule({
  policy,
  quiz,
  subjectCode,
  subjectSlug,
  subjectTitle,
}: {
  policy: QuizStartPolicy;
  quiz: QuizItem;
  subjectCode: string;
  subjectSlug: string;
  subjectTitle: string;
}) {
  const router = useRouter();
  const startRequestIdRef = useRef<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function start() {
    if (isStarting) return;
    setIsStarting(true);
    setMessage(null);
    try {
      const requestId = startRequestIdRef.current ?? crypto.randomUUID();
      startRequestIdRef.current = requestId;
      const response = await startQuizAction(subjectCode, quiz.slug, requestId);
      if (!response.ok) {
        setMessage(response.message);
        return;
      }
      router.replace(`/quiz/${subjectSlug}/${quiz.slug}?attemptId=${encodeURIComponent(response.result.attemptId)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kuis belum dapat dimulai.");
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-4xl items-center px-5 py-12">
      <section className="w-full rounded-[2rem] border border-primary-100 bg-white p-7 shadow-[0_24px_56px_-38px_color-mix(in_oklab,var(--voyage-deep)_50%,transparent)] sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary-700">{subjectTitle}</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-secondary-900 sm:text-4xl">{quiz.title}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-secondary-600">Kuis belum dimulai. Periksa jumlah soal dan kebijakan percobaan, lalu tekan Mulai ketika siap.</p>
        <div className="mt-7 grid gap-3 text-sm text-secondary-700 sm:grid-cols-3">
          <PolicyStat label="Jumlah soal" value={`${quiz.questionCount}`} />
          <PolicyStat label="Percobaan" value={policy.attemptsAllowed === null ? "Tanpa batas" : `${policy.attemptsAllowed} kali`} />
          <PolicyStat label="Skor" value={policy.scorePolicy === "highest" ? "Tertinggi" : policy.scorePolicy === "first" ? "Pertama" : policy.scorePolicy === "average" ? "Rata-rata" : "Terbaru"} />
          <PolicyStat label="Bentuk soal" value={policy.formBehavior === "fresh_randomized" ? "Acak tiap percobaan" : "Urutan tetap"} />
          <PolicyStat label="Tinjauan" value={policy.reviewTiming === "after_close" ? "Setelah ditutup" : policy.reviewTiming === "never" ? "Tidak tersedia" : "Langsung"} />
          <PolicyStat label="Jawaban benar" value={policy.correctAnswerVisibility === "hide" ? "Disembunyikan" : "Ditampilkan"} />
        </div>
        {policy.retryDelaySeconds ? <p className="mt-5 text-sm text-secondary-500">Percobaan ulang memiliki jeda sebelum dapat dimulai kembali.</p> : null}
        {message ? <p className="mt-5 text-sm font-medium text-danger-700" role="alert">{message}</p> : null}
        <div className="mt-8 flex flex-wrap gap-3">
          <Button disabled={isStarting} onClick={() => { void start(); }} size="lg" variant="brand">
            {isStarting ? "Memulai…" : "Mulai kuis"}
          </Button>
          <Button disabled={isStarting} onClick={() => router.push(`/quiz/${subjectSlug}`)} size="lg" variant="brandOutline">
            Kembali
          </Button>
        </div>
      </section>
    </main>
  );
}

function PolicyStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-primary-100 bg-primary-50/50 px-4 py-3"><p className="text-xs font-medium text-secondary-500">{label}</p><p className="mt-1 font-semibold text-secondary-900">{value}</p></div>;
}

export { QuizStartPageModule };

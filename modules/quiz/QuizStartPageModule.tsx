"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";

import { startQuizAction } from "./actions";
import type { QuizItem } from "./data";
import { canStartQuiz, type QuizStartAvailability } from "./start-availability";

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
  startAvailability,
  subjectCode,
  subjectSlug,
  subjectTitle,
}: {
  policy: QuizStartPolicy;
  quiz: QuizItem;
  startAvailability: QuizStartAvailability;
  subjectCode: string;
  subjectSlug: string;
  subjectTitle: string;
}) {
  const router = useRouter();
  const startRequestIdRef = useRef<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const canStart = canStartQuiz(startAvailability);
  const retryAvailableAtLabel = startAvailability.kind === "retry-wait"
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(new Date(startAvailability.retryAvailableAt))
    : null;

  async function start() {
    if (isStarting) return;
    setIsStarting(true);
    try {
      const requestId = startRequestIdRef.current ?? crypto.randomUUID();
      startRequestIdRef.current = requestId;
      const response = await startQuizAction(subjectCode, quiz.slug, requestId);
      if (!response.ok) {
        showToast(response.message, { variant: "error" });
        router.refresh();
        return;
      }
      router.replace(
        `/quiz/${subjectSlug}/${quiz.slug}?attemptId=${encodeURIComponent(response.result.attemptId)}`,
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Kuis belum dapat dimulai.",
        { variant: "error" },
      );
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <main className="student-page-canvas flex min-h-svh w-full items-center px-5 py-12">
      <section className="mx-auto w-full max-w-4xl p-7 sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary-700">
          {subjectTitle}
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-secondary-900 sm:text-4xl">
          {quiz.title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-secondary-600">
          Siap mengasah logika? Cek dulu detail kuisnya, lalu mulai kalau kamu
          sudah siap!
        </p>
        <div className="mt-7 grid gap-3 text-sm text-secondary-700 sm:grid-cols-3">
          <PolicyStat
            label="Jumlah soal"
            value={`${quiz.questionCount} soal`}
          />
          <PolicyStat
            label="Kesempatan"
            value={
              policy.attemptsAllowed === null
                ? "Tanpa batas"
                : `${policy.attemptsAllowed} kali`
            }
          />
          <PolicyStat
            label="Skor kamu"
            value={
              policy.scorePolicy === "highest"
                ? "Tertinggi"
                : policy.scorePolicy === "first"
                  ? "Pertama"
                  : policy.scorePolicy === "average"
                    ? "Rata-rata"
                    : "Terbaru"
            }
          />
          <PolicyStat
            label="Urutan soal"
            value={
              policy.formBehavior === "fresh_randomized" ? "Acak" : "Tetap"
            }
          />
          <PolicyStat
            label="Cek jawaban"
            value={
              policy.reviewTiming === "after_close"
                ? "Setelah ditutup"
                : policy.reviewTiming === "never"
                  ? "Tidak tersedia"
                  : "Langsung"
            }
          />
          <PolicyStat
            label="Kunci jawaban"
            value={
              policy.correctAnswerVisibility === "hide"
                ? "Disembunyikan"
                : "Ditampilkan"
            }
          />
        </div>
        {policy.retryDelaySeconds && startAvailability.kind === "available" ? (
          <p className="mt-5 text-sm text-secondary-500">
            Percobaan ulang memiliki jeda sebelum dapat dimulai kembali.
          </p>
        ) : null}
        {startAvailability.kind === "exhausted" ? (
          <div
            className="mt-7 rounded-2xl border border-student-status-attention-border bg-student-status-attention-bg px-5 py-4 text-student-status-attention-fg"
            role="status"
          >
            <p className="font-semibold">Kesempatan mengerjakan kuis ini sudah habis</p>
            <p className="mt-1 text-sm leading-6">
              Kamu sudah menggunakan seluruh percobaan yang tersedia.
            </p>
          </div>
        ) : null}
        {startAvailability.kind === "retry-wait" ? (
          <div
            className="mt-7 rounded-2xl border border-student-status-attention-border bg-student-status-attention-bg px-5 py-4 text-student-status-attention-fg"
            role="status"
          >
            <p className="font-semibold">Jeda percobaan belum selesai</p>
            <p className="mt-1 text-sm leading-6">
              Kesempatan berikutnya tersedia pada {retryAvailableAtLabel} WIB.
            </p>
          </div>
        ) : null}
        <div className="mt-8 flex flex-wrap gap-3">
          {canStart ? (
            <Button
              disabled={isStarting}
              onClick={() => {
                void start();
              }}
              size="lg"
              variant="brand"
            >
              {isStarting
                ? startAvailability.kind === "resume"
                  ? "Melanjutkan…"
                  : "Memulai…"
                : startAvailability.kind === "resume"
                  ? "Lanjutkan kuis"
                  : "Mulai kuis"}
            </Button>
          ) : null}
          {startAvailability.kind === "retry-wait" ? (
            <Button
              onClick={() => router.refresh()}
              size="lg"
              variant="brand"
            >
              Perbarui status
            </Button>
          ) : null}
          <Button
            disabled={isStarting}
            onClick={() => router.push(`/quiz/${subjectSlug}`)}
            size="lg"
            variant="brandOutline"
          >
            {canStart ? "Nanti dulu" : "Kembali ke daftar kuis"}
          </Button>
        </div>
      </section>
    </main>
  );
}

function PolicyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3">
      <p className="text-xs font-medium text-secondary-500">{label}</p>
      <p className="mt-1 font-semibold text-secondary-900">{value}</p>
    </div>
  );
}

export { QuizStartPageModule };

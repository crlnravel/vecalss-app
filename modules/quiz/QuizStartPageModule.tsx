"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";

import { startQuizAction } from "./actions";
import type { QuizItem } from "./data";
import { canStartQuiz, type QuizStartAvailability } from "./start-availability";

const RETRY_AVAILABLE_AT_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

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
    ? RETRY_AVAILABLE_AT_FORMATTER.format(new Date(startAvailability.retryAvailableAt))
    : null;
  const stats = getQuizStats(quiz.questionCount, quiz.duration);

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
    } catch {
      showToast(
        "Kuis belum berhasil dimulai. Periksa koneksi lalu coba lagi.",
        { variant: "error" },
      );
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <main className="student-page-canvas flex min-h-svh w-full items-center px-5 py-12">
      <section className="mx-auto w-full max-w-4xl rounded-card border border-border bg-card p-7 shadow-sm sm:p-10">
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
        <dl className="mt-7 space-y-3 text-sm text-secondary-700">
          {stats.map((stat) => <QuizStat key={stat.label} {...stat} />)}
        </dl>
        <QuizAvailabilityStatus policy={policy} retryAvailableAtLabel={retryAvailableAtLabel} startAvailability={startAvailability} />
        <QuizStartActions
          availability={startAvailability}
          canStart={canStart}
          isStarting={isStarting}
          onBack={() => router.push(`/quiz/${subjectSlug}`)}
          onRefresh={() => router.refresh()}
          onStart={() => { void start(); }}
        />
      </section>
    </main>
  );
}

function getQuizStats(questionCount: number, duration: string) {
  return [
    { label: "Jumlah soal", value: `${questionCount} soal` },
    { label: "Waktu", value: duration || "Tanpa batas waktu" },
  ];
}

function QuizAvailabilityStatus({
  policy,
  retryAvailableAtLabel,
  startAvailability,
}: {
  policy: QuizStartPolicy;
  retryAvailableAtLabel: string | null;
  startAvailability: QuizStartAvailability;
}) {
  if (policy.retryDelaySeconds && startAvailability.kind === "available") {
    return <p className="mt-5 text-sm text-secondary-500">Percobaan ulang memiliki jeda sebelum dapat dimulai kembali.</p>;
  }
  if (startAvailability.kind === "exhausted") {
    return (
      <div className="mt-7 rounded-2xl border border-student-status-attention-border bg-student-status-attention-bg px-5 py-4 text-student-status-attention-fg" role="status">
        <p className="font-semibold">Kesempatan mengerjakan kuis ini sudah habis</p>
        <p className="mt-1 text-sm leading-6">Kamu sudah menggunakan seluruh percobaan yang tersedia.</p>
      </div>
    );
  }
  if (startAvailability.kind === "retry-wait") {
    return (
      <div className="mt-7 rounded-2xl border border-student-status-attention-border bg-student-status-attention-bg px-5 py-4 text-student-status-attention-fg" role="status">
        <p className="font-semibold">Jeda percobaan belum selesai</p>
        <p className="mt-1 text-sm leading-6">Kesempatan berikutnya tersedia pada {retryAvailableAtLabel} WIB.</p>
      </div>
    );
  }
  return null;
}

function QuizStartActions({
  availability,
  canStart,
  isStarting,
  onBack,
  onRefresh,
  onStart,
}: {
  availability: QuizStartAvailability;
  canStart: boolean;
  isStarting: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onStart: () => void;
}) {
  const startLabel = getQuizStartLabel(availability, isStarting);
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {canStart ? <Button disabled={isStarting} onClick={onStart} size="lg" variant="default">{startLabel}</Button> : null}
      {availability.kind === "retry-wait" ? <Button onClick={onRefresh} size="lg" variant="default">Perbarui status</Button> : null}
      <Button disabled={isStarting} onClick={onBack} size="lg" variant="outline">{canStart ? "Nanti dulu" : "Kembali ke daftar kuis"}</Button>
    </div>
  );
}

function getQuizStartLabel(availability: QuizStartAvailability, isStarting: boolean) {
  if (isStarting) return availability.kind === "resume" ? "Melanjutkan…" : "Memulai…";
  return availability.kind === "resume" ? "Lanjutkan kuis" : "Mulai kuis";
}

function QuizStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-1">
      <dt>{label}:</dt>
      <dd className="font-semibold text-secondary-900">{value}</dd>
    </div>
  );
}

export { QuizStartPageModule };

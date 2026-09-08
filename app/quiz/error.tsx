"use client";

import { useEffect } from "react";

import { TypedRouteState } from "@/components/ui/typed-route-state";

export default function QuizError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Student Kuis route failed", error);
  }, [error]);

  return (
    <TypedRouteState
      className="student-page-canvas"
      description="Kuis belum dapat dimuat. Coba lagi untuk memeriksa layanan Kuis; jawaban yang sudah tersimpan tidak berubah."
      kind="error"
      onRetry={reset}
      returnHref="/quiz"
      returnLabel="Kembali ke Kuis"
      title="Kuis belum dapat dimuat"
    />
  );
}

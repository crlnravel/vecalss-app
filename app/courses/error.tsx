"use client";

import { useEffect } from "react";

import { TypedRouteState } from "@/components/ui/typed-route-state";

export default function CoursesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Student Materi route failed", error);
  }, [error]);

  return (
    <TypedRouteState
      description="Materi belum dapat dimuat. Coba lagi sebentar; progres belajarmu tetap tersimpan."
      kind="error"
      onRetry={reset}
      returnHref="/courses"
      returnLabel="Kembali ke Materi"
      title="Materi belum dapat dimuat"
    />
  );
}

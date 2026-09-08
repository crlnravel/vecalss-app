"use client";

import { useEffect } from "react";

import { TypedRouteState } from "@/components/ui/typed-route-state";

export default function TryoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Student Tryout route failed", error);
  }, [error]);

  return (
    <TypedRouteState
      className="student-page-canvas"
      description="Tryout belum dapat dimuat. Coba lagi untuk memeriksa layanan Tryout; percobaan yang sudah tersimpan tetap aman."
      kind="error"
      onRetry={reset}
      returnHref="/tryout"
      returnLabel="Kembali ke Tryout"
      title="Tryout belum dapat dimuat"
    />
  );
}

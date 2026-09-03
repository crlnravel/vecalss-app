"use client";

import { useEffect } from "react";

import { TypedRouteState } from "@/components/ui/typed-route-state";

export default function MentorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Kapten route failed", error);
  }, [error]);

  return (
    <TypedRouteState
      description="Ruang kerja Kapten belum dapat dimuat. Coba lagi untuk memeriksa layanan tanpa mengubah data yang tersimpan."
      kind="error"
      onRetry={reset}
      returnHref="/mentor/tryout"
      returnLabel="Kembali ke Tryout"
      title="Ruang Kapten belum tersedia"
    />
  );
}

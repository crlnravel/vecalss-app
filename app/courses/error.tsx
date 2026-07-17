"use client";

import { useEffect } from "react";

export default function CoursesError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Student Materi route failed", error);
  }, [error]);

  return (
    <main className="flex min-h-svh items-center justify-center bg-[#fbfcff] px-6 text-center text-[#182334]">
      <div className="max-w-md rounded-3xl border border-[#e8ecf2] bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Materi belum dapat dimuat</h1>
        <p className="mt-3 text-sm leading-6 text-[#667085]">Coba lagi sebentar. Progres belajarmu di perangkat ini tetap tersimpan.</p>
        <button className="mt-6 rounded-xl bg-[#075f46] px-4 py-2.5 text-sm font-semibold text-white" onClick={unstable_retry} type="button">Coba lagi</button>
      </div>
    </main>
  );
}

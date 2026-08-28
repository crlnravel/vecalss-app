"use client";

import { ShieldCheck } from "@/lib/icons";

export function AiPrivacyNotice() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-primary-100 bg-primary-50/50 p-4 text-xs text-secondary-600">
      <ShieldCheck className="mt-0.5 size-4.5 shrink-0 text-primary-700" />
      <div>
        <p className="font-bold text-secondary-900">
          Data diringkas untuk menjaga privasi siswa
        </p>
        <p className="mt-0.5 leading-relaxed text-secondary-600">
          Dashboard ini hanya menampilkan data gabungan. Kelompok yang terlalu kecil disembunyikan otomatis, dan isi pesan siswa tidak pernah dimuat ke sini.
        </p>
      </div>
    </div>
  );
}

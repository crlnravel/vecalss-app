"use client";

import type { QuotaHealthState } from "@/lib/admin/ai/contracts";

export function AiQuotaGauge({ quotaHealth }: { quotaHealth: QuotaHealthState }) {
  const {
    allocatedDailyUnits,
    consumedUnits,
    reservedUnits,
    availableUnits,
    consumedPercentage,
    reservedPercentage,
    availablePercentage,
  } = quotaHealth;

  return (
    <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
      <div className="border-b border-primary-50 pb-4">
        <div>
          <h3 className="text-base font-bold text-secondary-950">Kuota Harian</h3>
          <p className="mt-0.5 text-xs text-secondary-500">
            Total kuota untuk semua siswa hari ini: {allocatedDailyUnits.toLocaleString("id-ID")}
          </p>
        </div>
      </div>

      {/* Segmented Bar */}
      <div className="mt-6">
        <div
          aria-label={`Terpakai ${consumedPercentage} persen, disiapkan ${reservedPercentage} persen, tersedia ${availablePercentage} persen`}
          className="flex h-3.5 w-full overflow-hidden rounded-full bg-secondary-100"
          role="img"
        >
          <div
            style={{ width: `${consumedPercentage}%` }}
            className="bg-primary-800 transition-all duration-500"
            title={`Terpakai: ${consumedPercentage}%`}
          />
          <div
            style={{ width: `${reservedPercentage}%` }}
            className="bg-amber-400 transition-all duration-500"
            title={`Disiapkan: ${reservedPercentage}%`}
          />
          <div
            style={{ width: `${availablePercentage}%` }}
            className="bg-sea-glass transition-all duration-500"
            title={`Tersedia: ${availablePercentage}%`}
          />
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-primary-800" />
            <span className="font-semibold text-secondary-700">
              Terpakai: {consumedUnits.toLocaleString("id-ID")} ({consumedPercentage}%)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-amber-400" />
            <span className="font-semibold text-secondary-700">
              Disiapkan: {reservedUnits.toLocaleString("id-ID")} ({reservedPercentage}%)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-sea-glass" />
            <span className="font-semibold text-secondary-700">
              Tersisa: {availableUnits.toLocaleString("id-ID")} ({availablePercentage}%)
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-secondary-50 p-4 text-xs text-secondary-600">
        <p className="font-bold text-secondary-800">Cara membaca angka ini</p>
        <p className="mt-1 leading-relaxed">
          Kuota terpakai menunjukkan pemakaian saat ini. Kuota yang disiapkan sudah dialokasikan untuk API Request yang sedang berjalan; sisanya masih bisa digunakan.
        </p>
      </div>
    </div>
  );
}

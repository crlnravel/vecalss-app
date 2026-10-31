"use client";

import type { QuotaHealthState } from "@/lib/admin/ai/contracts";

export function AiQuotaGauge({ quotaHealth }: { quotaHealth: QuotaHealthState }) {
  if (quotaHealth.privacyState === "suppressed") return <section className="rounded-card border border-primary-100 bg-white p-6"><h3 className="text-base font-bold text-secondary-950">Kuota Harian</h3><p className="mt-2 text-sm text-secondary-600">Ringkasan disembunyikan untuk menjaga privasi siswa.</p></section>;
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
    <div className="rounded-card border border-primary-100 bg-white p-6 shadow-sm">
      <div className="border-b border-primary-50 pb-4">
        <div>
          <h3 className="text-base font-bold text-secondary-950">Kuota Harian</h3>
          <p className="mt-0.5 text-xs text-secondary-500">
            {quotaHealth.capacityAvailable ? `Total kuota untuk semua siswa hari ini: ${allocatedDailyUnits.toLocaleString("id-ID")}` : "Kapasitas kuota keseluruhan belum tersedia."}
          </p>
        </div>
      </div>

      {/* Segmented Bar */}
      {quotaHealth.capacityAvailable ? <div className="mt-6">
        <div
          aria-label={`Terpakai ${consumedPercentage} persen, disiapkan ${reservedPercentage} persen, tersedia ${availablePercentage} persen`}
          className="flex h-3.5 w-full overflow-hidden rounded-full bg-secondary-100"
          role="img"
        >
          <div
            style={{ width: `${consumedPercentage}%` }}
            className="bg-primary-800 transition-[width] duration-500 motion-reduce:transition-none"
            title={`Terpakai: ${consumedPercentage}%`}
          />
          <div
            style={{ width: `${reservedPercentage}%` }}
            className="bg-warning-400 transition-[width] duration-500 motion-reduce:transition-none"
            title={`Disiapkan: ${reservedPercentage}%`}
          />
          <div
            style={{ width: `${availablePercentage}%` }}
            className="bg-sea-glass transition-[width] duration-500 motion-reduce:transition-none"
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
            <span className="size-2.5 rounded-full bg-warning-400" />
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
      </div> : <dl className="mt-6 grid grid-cols-2 gap-4 text-sm"><div><dt>Terpakai</dt><dd className="font-bold">{consumedUnits.toLocaleString("id-ID")}</dd></div><div><dt>Disiapkan</dt><dd className="font-bold">{reservedUnits.toLocaleString("id-ID")}</dd></div></dl>}

      <div className="mt-6 rounded-card bg-secondary-50 p-4 text-xs text-secondary-600">
        <p className="font-bold text-secondary-800">Cara membaca angka ini</p>
        <p className="mt-1 leading-relaxed">
          Kuota terpakai dihitung dari pemakaian hari ini (WIB). Kuota yang disiapkan dialokasikan untuk permintaan yang sedang berjalan. Sisa kuota hanya ditampilkan jika kapasitas keseluruhan diketahui.
        </p>
      </div>
    </div>
  );
}

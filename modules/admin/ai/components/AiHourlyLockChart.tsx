"use client";

import { AlertTriangle } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { QuotaHealthState } from "@/lib/admin/ai/contracts";

export function AiHourlyLockChart({ quotaHealth }: { quotaHealth: QuotaHealthState }) {
  const { hourlyLocks, earlyExhaustionAlert } = quotaHealth;
  const maxLocks = Math.max(1, ...hourlyLocks.map((h) => h.lockCount));

  return (
    <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-3 border-b border-primary-50 pb-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-base font-bold text-secondary-950">Distribusi Kunci Batas Kuota per Jam</h3>
          <p className="mt-0.5 text-xs text-secondary-500">
            Waktu Indonesia Barat (WIB) — Pola konsumsi harian dan lonjakan siswa yang mencapai batas kuota
          </p>
        </div>

        {earlyExhaustionAlert.status !== "normal" && (
          <div className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3.5 py-2 border border-amber-200 text-xs text-amber-900">
            <AlertTriangle className="size-4 shrink-0 text-amber-700" />
            <span>
              <strong>Peringatan Kuota Dini:</strong> {earlyExhaustionAlert.exhaustedBeforeNoonShare}% siswa kehabisan kuota sebelum 12:00 WIB
            </span>
          </div>
        )}
      </div>

      {/* Hourly Bar Chart */}
      <div className="mt-6 flex items-end gap-1 sm:gap-1.5 h-36 pt-4">
        {hourlyLocks.map((item) => {
          const heightPercent = Math.max(4, Math.round((item.lockCount / maxLocks) * 100));
          const isPrimeEvening = item.hour >= 18 && item.hour <= 22;

          return (
            <div
              key={item.hour}
              className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end"
            >
              {/* Tooltip on hover */}
              <div className="absolute -top-8 hidden group-hover:flex z-10 whitespace-nowrap rounded-lg bg-secondary-900 px-2 py-1 text-[10px] text-white shadow-md">
                Pukul {item.hourLabel}: {item.lockCount} siswa terkunci
              </div>

              <div
                style={{ height: `${heightPercent}%` }}
                className={cn(
                  "w-full rounded-t-md transition-all duration-300",
                  isPrimeEvening
                    ? "bg-primary-800 hover:bg-primary-900"
                    : "bg-primary-300 hover:bg-primary-400",
                )}
              />

              {item.hour % 3 === 0 && (
                <span className="text-[10px] text-secondary-500 font-mono mt-1">
                  {String(item.hour).padStart(2, "0")}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-primary-50 pt-3 text-xs text-secondary-500">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-primary-800" />
          <span>Jam belajar utama (18:00 - 22:00 WIB)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-primary-300" />
          <span>Jam siang / pagi hari</span>
        </div>
      </div>
    </div>
  );
}

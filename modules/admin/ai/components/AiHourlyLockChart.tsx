"use client";

import { AlertTriangle } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { QuotaHealthState } from "@/lib/admin/ai/contracts";

export function AiHourlyLockChart({ quotaHealth }: { quotaHealth: QuotaHealthState }) {
  const { hourlyLocks, earlyExhaustionAlert } = quotaHealth;
  const maxLocks = Math.max(1, ...hourlyLocks.map((h) => h.lockCount));

  return (
    <section
      aria-labelledby="ai-hourly-lock-chart-heading"
      className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col justify-between gap-3 border-b border-primary-50 pb-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-secondary-950" id="ai-hourly-lock-chart-heading">
            Distribusi Kunci Batas Kuota per Jam
          </h2>
          <p className="mt-0.5 text-xs text-secondary-500">
            Waktu Indonesia Barat (WIB) — Pola konsumsi harian dan lonjakan siswa yang mencapai batas kuota
          </p>
        </div>

        {earlyExhaustionAlert.status !== "normal" && (
          <div
            aria-live="polite"
            className="flex min-w-0 items-center gap-2 rounded-2xl border border-warning-200 bg-warning-50 px-3.5 py-2 text-xs text-warning-900"
            role="status"
          >
            <AlertTriangle className="size-4 shrink-0 text-warning-700" />
            <span>
              <strong>Peringatan Kuota Dini:</strong> {earlyExhaustionAlert.exhaustedBeforeNoonShare}% siswa kehabisan kuota sebelum 12:00 WIB
            </span>
          </div>
        )}
      </div>

      {/* Hourly Bar Chart */}
      <div aria-hidden="true" className="mt-6 flex h-36 items-end gap-1 pt-4 sm:gap-1.5">
        {hourlyLocks.map((item) => {
          const heightPercent = Math.max(4, Math.round((item.lockCount / maxLocks) * 100));
          const isPrimeEvening = item.hour >= 18 && item.hour <= 22;

          return (
            <div
              key={item.hour}
              className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end"
            >
              {/* Tooltip on hover */}
              <div className="absolute -top-9 z-10 hidden whitespace-nowrap rounded-xl border border-voyage-deep/20 bg-voyage-surface px-2.5 py-1.5 text-ui-xs text-voyage-deep shadow-[0_12px_28px_-18px_color-mix(in_oklab,var(--voyage-deep)_45%,transparent)] group-hover:flex">
                Pukul {item.hourLabel}: {item.lockCount} siswa terkunci
              </div>

              <div
                style={{ height: `${heightPercent}%` }}
                className={cn(
                  "w-full rounded-t-md transition-[height,background-color] duration-300 motion-reduce:transition-none",
                  isPrimeEvening
                    ? "bg-primary-800 hover:bg-primary-900"
                    : "bg-primary-300 hover:bg-primary-400",
                )}
              />

              {item.hour % 3 === 0 && (
                <span className="mt-1 font-mono text-ui-xs text-secondary-500">
                  {String(item.hour).padStart(2, "0")}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <ul aria-label="Rincian kunci batas kuota per jam" className="sr-only">
        {hourlyLocks.map((item) => (
          <li key={`${item.hour}-summary`}>
            Pukul {item.hourLabel}: {item.lockCount.toLocaleString("id-ID")} siswa terkunci; kumulatif {item.cumulativeLocks.toLocaleString("id-ID")}.
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between border-t border-primary-50 pt-3 text-xs text-secondary-500">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-primary-800" />
          <span>Jam belajar utama (18:00 - 22:00 WIB)</span>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-primary-300" />
          <span>Jam siang / pagi hari</span>
        </div>
      </div>
    </section>
  );
}

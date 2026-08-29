"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
} from "@/lib/icons";
import { PortalShell } from "@/modules/portal/components/portal-shell";
import type { SessionContext } from "@/lib/auth/types";
import type { VeraAiOverviewDto } from "@/lib/admin/ai/contracts";
import { AiControlPlaneNav } from "./components/AiControlPlaneNav";
import { AiRefreshBar } from "./components/AiRefreshBar";
import { AiMetricCard } from "./components/AiMetricCard";
import { AiQuotaGauge } from "./components/AiQuotaGauge";
import { formatAiFeatureLabel } from "./components/AiDisplayLabels";

export function AiOverviewPageModule({
  session,
  initialData,
}: {
  session: SessionContext;
  initialData?: VeraAiOverviewDto | null;
}) {
  const [data, setData] = useState<VeraAiOverviewDto | null>(initialData ?? null);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(() => (initialData ? new Date() : null));

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai/overview", { cache: "no-store" });
      if (!res.ok) throw new Error("Gagal memuat ringkasan operasional Vera AI.");
      const json = (await res.json()) as VeraAiOverviewDto;
      setData(json);
      setLastRefreshedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan sistem.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialData) {
      const timer = window.setTimeout(() => {
        void loadOverview();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [initialData, loadOverview]);

  const maxRequestCount = data
    ? Math.max(
        1,
        ...data.requestsOverTime.map(
          (s) => s.succeeded + s.fallback + s.failed + s.pendingOrStaged,
        ),
      )
    : 1;

  return (
    <PortalShell
      activeAdminSection="ai"
      audience="admin"
      description="Ringkasan penggunaan Vera AI, kuota harian, dan pengeluaran."
      session={session}
       title="Ringkasan"
    >
      <div>
        {/* Orientation band: page title with the data-refresh control docked beside it */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-secondary-950 sm:text-3xl">
             Ringkasan
          </h1>
          <AiRefreshBar
            lastRefreshedAt={lastRefreshedAt}
            isLoading={isLoading}
            onRefresh={() => void loadOverview()}
          />
        </div>

        {/* Tab Navigation (full-width equal-width line tab variant) */}
        <div className="mt-6">
          <AiControlPlaneNav activeTab="overview" />
        </div>

        {error && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle className="size-5 shrink-0 text-red-600" />
            <p>{error}</p>
          </div>
        )}

        {isLoading && !data ? (
          <div className="mt-8 space-y-10 animate-pulse">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 rounded-2xl bg-secondary-100" />
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-80 rounded-3xl bg-secondary-100" />
              <div className="h-80 rounded-3xl bg-secondary-100" />
            </div>
            <div className="h-64 rounded-3xl bg-secondary-100" />
          </div>
        ) : null}

        {data && (
          <div className="mt-8 space-y-10">
            {/* KPI band */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <AiMetricCard title="API Request Hari Ini" metric={data.kpis.requestsToday} />
              <AiMetricCard title="Siswa Aktif Belajar" metric={data.kpis.activeLearnersToday} />
              <AiMetricCard title="Kuota Terpakai" metric={data.kpis.quotaConsumedToday} />
              <AiMetricCard title="Pengeluaran Bulan Ini" metric={data.kpis.spendMtdIdr} />
            </div>

            {/* Volume & quota health */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Requests Over Time */}
              <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4 border-b border-primary-50 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-secondary-950">API Request Vera AI Hari Ini</h3>
                    <p className="mt-1 text-xs text-secondary-500">Jumlah API Request yang masuk sepanjang hari</p>
                  </div>
                  <Link
                    href="/admin/ai/usage"
                    className="flex shrink-0 items-center gap-1 text-xs font-bold text-primary-700 hover:underline"
                  >
                     <span>Lihat detail</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>

                <div className="mt-6 flex h-40 items-end gap-2 sm:gap-3">
                  {data.requestsOverTime.map((slot, index) => {
                    const totalSlot = slot.succeeded + slot.fallback + slot.failed + slot.pendingOrStaged;
                    const heightPercent = Math.max(10, Math.round((totalSlot / maxRequestCount) * 100));

                    return (
                      <div key={slot.timeLabel} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                        {totalSlot > 0 ? (
                          <div
                            style={{ height: `${heightPercent}%` }}
                            className="w-full rounded-t-lg bg-primary-700 transition-all"
                            title={`${totalSlot.toLocaleString("id-ID")} API Request pada ${slot.timeLabel}`}
                          />
                        ) : (
                          <div className="h-0.5 w-full rounded-full bg-primary-100" />
                        )}
                        <span className={`mt-1 text-xs text-secondary-500 ${index % 2 === 1 ? "hidden sm:block" : ""}`}>
                          {slot.timeLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 border-t border-primary-50 pt-3 text-xs text-secondary-500">
                  Setiap batang menunjukkan jumlah API Request dalam rentang empat jam.
                </div>
              </div>

              {/* Quota Health Component */}
              <AiQuotaGauge quotaHealth={data.quotaHealth} />
            </div>

            {/* Feature usage */}
            <div className="grid gap-6">
              {/* Feature Usage */}
              <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4 border-b border-primary-50 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-secondary-950">Pemakaian Kuota per Fitur</h3>
                    <p className="mt-1 text-xs text-secondary-500">Fitur yang paling banyak digunakan hari ini</p>
                  </div>
                  <Link
                    href="/admin/ai/usage"
                    className="flex shrink-0 items-center gap-1 text-xs font-bold text-primary-700 hover:underline"
                  >
                     <span>Lihat semua</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>

                <div className="mt-6 space-y-4">
                  {data.featureUsageBreakdown.map((item) => (
                    <div key={item.capability} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-secondary-800">{formatAiFeatureLabel(item.label)}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-secondary-500">{item.quotaUnits.toLocaleString("id-ID")} kuota</span>
                          <span className="font-bold text-secondary-950">{item.sharePercentage}%</span>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary-100">
                        <div
                          style={{ width: `${item.sharePercentage}%` }}
                          className="h-full rounded-full bg-primary-700 transition-all duration-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ChevronDown } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PortalShell } from "@/modules/portal/components/portal-shell";
import type { SessionContext } from "@/lib/auth/types";
import type { VeraAiUsageBreakdownDto } from "@/lib/admin/ai/contracts";
import { AiControlPlaneNav } from "./components/AiControlPlaneNav";
import { AiPrivacyNotice } from "./components/AiPrivacyNotice";
import { AiRefreshBar } from "./components/AiRefreshBar";
import { formatAiCurrency, formatAiFeatureLabel } from "./components/AiDisplayLabels";

type MetricOption = "quota_units" | "requests" | "tokens" | "cost";
type PeriodOption = "today" | "7days" | "30days";

const METRIC_LABELS: Record<MetricOption, string> = {
  quota_units: "Kuota terpakai",
  requests: "Permintaan",
  tokens: "Teks diproses",
  cost: "Perkiraan biaya",
};

const PERIOD_LABELS: Record<PeriodOption, string> = {
  today: "Hari ini",
  "7days": "7 hari terakhir",
  "30days": "30 hari terakhir",
};

function getUsageRange(period: PeriodOption) {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  const daysBack = period === "today" ? 0 : period === "7days" ? 6 : 29;
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - daysBack);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta",
  };
}

function formatRange(from: string, to: string) {
  const formatter = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return "Periode yang dipilih";
  return fromDate.toDateString() === toDate.toDateString()
    ? formatter.format(fromDate)
    : `${formatter.format(fromDate)} – ${formatter.format(toDate)}`;
}

function formatSelectedMetric(data: VeraAiUsageBreakdownDto["items"][number], metric: MetricOption) {
  if (metric === "quota_units") return `${data.quotaUnits.toLocaleString("id-ID")} kuota`;
  if (metric === "requests") return `${data.requests.toLocaleString("id-ID")} permintaan`;
  if (metric === "tokens") return `${data.tokens.toLocaleString("id-ID")} bagian teks`;
  return formatAiCurrency(data.costUsd * 16_000);
}

export function AiUsagePageModule({ session }: { session: SessionContext }) {
  const [metric, setMetric] = useState<MetricOption>("quota_units");
  const [period, setPeriod] = useState<PeriodOption>("today");
  const [data, setData] = useState<VeraAiUsageBreakdownDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const loadUsage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const range = getUsageRange(period);
      const params = new URLSearchParams({
        metric,
        groupBy: "feature",
        from: range.from,
        to: range.to,
        timezone: range.timezone,
      });
      const res = await fetch(`/api/admin/ai/usage?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Gagal memuat data penggunaan Vera AI.");
      const json = (await res.json()) as VeraAiUsageBreakdownDto;
      setData(json);
      setLastRefreshedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan sistem.");
    } finally {
      setIsLoading(false);
    }
  }, [metric, period]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsage();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadUsage]);

  return (
    <PortalShell
      activeAdminSection="ai"
      audience="admin"
      description="Lihat pemakaian Vera AI dan perkiraan biayanya dalam ringkasan yang mudah dibaca."
      session={session}
      title="Usage"
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-secondary-950 sm:text-3xl">Usage</h1>
          <p className="mt-1 max-w-2xl text-sm text-secondary-600">
            Pantau seberapa sering Vera digunakan, kuota yang sudah terpakai, dan perkiraan pengeluaran tanpa membuka isi percakapan siswa.
          </p>
        </div>

        <AiControlPlaneNav activeTab="usage" />

        <AiRefreshBar
          lastRefreshedAt={lastRefreshedAt}
          isLoading={isLoading}
          onRefresh={() => void loadUsage()}
        />

        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle className="size-5 shrink-0 text-red-600" />
            <p>{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-5 rounded-3xl border border-primary-100 bg-white p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold text-secondary-950">Angka yang ingin dilihat</p>
            <p className="mt-1 text-xs text-secondary-500">Pilih satu ukuran utama untuk membandingkan pemakaian antar fitur.</p>
            <div className="mt-3 flex flex-wrap gap-1 rounded-2xl border border-secondary-100 bg-secondary-50 p-1" role="group" aria-label="Ukuran penggunaan">
              {(Object.keys(METRIC_LABELS) as MetricOption[]).map((option) => (
                <button
                  key={option}
                  aria-pressed={metric === option}
                  className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                    metric === option
                      ? "border border-primary-100 bg-white text-secondary-950 shadow-xs"
                      : "text-secondary-500 hover:text-secondary-900"
                  }`}
                  onClick={() => setMetric(option)}
                  type="button"
                >
                  {METRIC_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-secondary-500">Periode</span>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="reference" size="sm" className="h-9 gap-1.5 rounded-xl text-xs font-bold" />}
              >
                {PERIOD_LABELS[period]}
                <ChevronDown className="size-3.5 text-secondary-400" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuRadioGroup value={period} onValueChange={(value) => setPeriod(value as PeriodOption)}>
                  {(Object.keys(PERIOD_LABELS) as PeriodOption[]).map((option) => (
                    <DropdownMenuRadioItem key={option} value={option}>
                      {PERIOD_LABELS[option]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {data && (
          <div className="space-y-6">
            <section className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-1 border-b border-primary-50 pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                <div>
                  <h2 className="text-base font-bold text-secondary-950">Pemakaian menurut fitur</h2>
                  <p className="mt-1 text-xs text-secondary-500">
                    Periode {formatRange(data.range.from, data.range.to)} · dikelompokkan berdasarkan fitur Vera
                  </p>
                </div>
                <p className="text-xs font-semibold text-secondary-600">Menampilkan: {METRIC_LABELS[metric]}</p>
              </div>

              {data.items.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-primary-100 bg-primary-50/40 px-4 py-8 text-center">
                  <p className="text-sm font-bold text-secondary-950">Belum ada pemakaian pada periode ini</p>
                  <p className="mt-1 text-xs text-secondary-500">Coba pilih rentang waktu yang lebih panjang.</p>
                </div>
              ) : (
                <>
                  <div className="mt-6 space-y-4">
                    {data.items.map((item) => (
                      <div key={item.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="font-semibold text-secondary-800">{formatAiFeatureLabel(item.label)}</span>
                          {item.privacyState === "suppressed" ? (
                            <span className="text-secondary-500">Disembunyikan untuk menjaga privasi</span>
                          ) : (
                            <span className="font-bold text-secondary-950">{formatSelectedMetric(item, metric)} · {item.sharePercentage}%</span>
                          )}
                        </div>
                        <div
                          aria-label={`${formatAiFeatureLabel(item.label)}: ${item.sharePercentage}% dari total`}
                          className="h-2.5 w-full overflow-hidden rounded-full bg-secondary-100"
                          role="img"
                        >
                          <div
                            style={{ width: `${item.privacyState === "suppressed" ? 0 : item.sharePercentage}%` }}
                            className={`h-full rounded-full transition-all duration-500 ${item.privacyState === "suppressed" ? "bg-secondary-300" : "bg-primary-700"}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 overflow-x-auto rounded-2xl border border-primary-100">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-primary-50/40">
                          <TableHead className="font-bold text-secondary-950">Fitur</TableHead>
                          <TableHead className="font-bold text-secondary-950">Permintaan</TableHead>
                          <TableHead className="font-bold text-secondary-950">Kuota terpakai</TableHead>
                          <TableHead className="font-bold text-secondary-950">Perkiraan biaya</TableHead>
                          <TableHead className="font-bold text-secondary-950">Bagian</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium text-secondary-900">{formatAiFeatureLabel(item.label)}</TableCell>
                            {item.privacyState === "suppressed" ? (
                              <TableCell colSpan={4} className="text-xs italic text-secondary-500">
                                Ringkasan disembunyikan untuk menjaga privasi siswa.
                              </TableCell>
                            ) : (
                              <>
                                <TableCell>{item.requests.toLocaleString("id-ID")}</TableCell>
                                <TableCell>{item.quotaUnits.toLocaleString("id-ID")}</TableCell>
                                <TableCell>{formatAiCurrency(item.costUsd * 16_000)}</TableCell>
                                <TableCell className="font-bold text-secondary-950">{item.sharePercentage}%</TableCell>
                              </>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </section>

            <section className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
              <div className="border-b border-primary-50 pb-4">
                <h2 className="text-base font-bold text-secondary-950">Perkiraan biaya</h2>
                <p className="mt-1 text-xs text-secondary-500">Semua angka ditampilkan dalam rupiah agar mudah dibandingkan dengan anggaran bulanan.</p>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl bg-primary-50/40 p-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-secondary-500">Bulan ini</p>
                  <p className="mt-1 text-lg font-extrabold text-secondary-950">{formatAiCurrency(data.cost.spendMtdIdr)}</p>
                </div>
                <div>
                  <p className="text-xs text-secondary-500">Perkiraan akhir bulan</p>
                  <p className="mt-1 text-lg font-extrabold text-secondary-950">{formatAiCurrency(data.cost.projectedEomIdr)}</p>
                </div>
                <div>
                  <p className="text-xs text-secondary-500">Anggaran bulanan</p>
                  <p className="mt-1 text-lg font-extrabold text-secondary-950">{formatAiCurrency(data.cost.monthlyBudgetIdr)}</p>
                </div>
                <div>
                  <p className="text-xs text-secondary-500">Perkiraan pemakaian anggaran</p>
                  <p className="mt-1 text-lg font-extrabold text-primary-800">{data.cost.projectedUtilizationShare}%</p>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto rounded-2xl border border-primary-100">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary-50/40">
                      <TableHead className="font-bold text-secondary-950">Fitur</TableHead>
                      <TableHead className="font-bold text-secondary-950">Kuota terpakai</TableHead>
                      <TableHead className="font-bold text-secondary-950">Perkiraan biaya</TableHead>
                      <TableHead className="font-bold text-secondary-950">Bagian</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.cost.costByCapability.map((capability) => (
                      <TableRow key={capability.capability}>
                        <TableCell className="font-medium text-secondary-900">{formatAiFeatureLabel(capability.capability)}</TableCell>
                        <TableCell>{capability.quotaUnits.toLocaleString("id-ID")}</TableCell>
                        <TableCell>{formatAiCurrency(capability.spendIdr)}</TableCell>
                        <TableCell className="font-bold text-secondary-950">{capability.share}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <p className="mt-5 rounded-2xl bg-secondary-50 p-4 text-xs leading-relaxed text-secondary-600">
                Perkiraan ini dihitung dari data transaksi yang tersedia. Cakupan data biaya saat ini <strong className="text-secondary-800">{data.cost.costCoverage.knownPercentage}%</strong>.
              </p>
            </section>

            <AiPrivacyNotice />
          </div>
        )}
      </div>
    </PortalShell>
  );
}

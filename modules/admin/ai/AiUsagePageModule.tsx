"use client";

import { AlertCircle, ChevronDown } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { CompactFilterTabs } from "@/components/ui/compact-filter-tabs";
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
import type { CostMetrics, VeraAiUsageBreakdownDto } from "@/lib/admin/ai/contracts";
import { AiControlPlaneNav } from "./components/AiControlPlaneNav";
import { AiFreshnessBanner } from "./components/AiFreshnessBanner";
import { AiHourlyLockChart } from "./components/AiHourlyLockChart";
import { AiRefreshBar } from "./components/AiRefreshBar";
import { formatAiCurrency, formatAiFeatureLabel } from "./components/AiDisplayLabels";
import { useAiUsage, type MetricOption, type PeriodOption } from "./use-ai-usage";

const METRIC_LABELS: Record<MetricOption, string> = {
  quota_units: "Kuota terpakai",
  requests: "API Request",
  tokens: "Token",
  cost: "Perkiraan biaya",
};

const PERIOD_LABELS: Record<PeriodOption, string> = {
  today: "Hari ini",
  "7days": "7 hari terakhir",
  "30days": "30 hari terakhir",
};

const RANGE_DATE_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

function formatRange(from: string, to: string) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return "Periode yang dipilih";
  return RANGE_DATE_FORMATTER.format(fromDate) === RANGE_DATE_FORMATTER.format(toDate)
    ? RANGE_DATE_FORMATTER.format(fromDate)
    : `${RANGE_DATE_FORMATTER.format(fromDate)} – ${RANGE_DATE_FORMATTER.format(toDate)}`;
}

function formatSelectedMetric(data: VeraAiUsageBreakdownDto["items"][number], metric: MetricOption) {
  if (metric === "quota_units") return `${data.quotaUnits.toLocaleString("id-ID")} kuota`;
  if (metric === "requests") return `${data.requests.toLocaleString("id-ID")} API Request`;
  if (metric === "tokens") return `${data.tokens.toLocaleString("id-ID")} Token`;
  return data.costAvailable ? formatAiCurrency(data.costUsd * 16_000) : "Biaya belum tersedia";
}

function formatReportedCost(value: number, state: CostMetrics["state"]) {
  if (state === "suppressed") return "Disembunyikan untuk menjaga privasi";
  if (state === "unavailable") return "Belum tersedia";
  return formatAiCurrency(value);
}

export function AiUsagePageModule({ session }: { session: SessionContext }) {
  const { metric, period, data, isLoading, error, lastRefreshedAt, selectMetric, selectPeriod, loadUsage } = useAiUsage();

  return (
    <PortalShell
      activeAdminSection="ai"
      audience="admin"
      description="Lihat pemakaian Vera AI dan perkiraan biayanya dalam ringkasan yang mudah dibaca."
      session={session}
      title="Pemakaian"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-secondary-950 sm:text-3xl">Pemakaian</h1>
          <AiRefreshBar
            lastRefreshedAt={lastRefreshedAt}
            isLoading={isLoading}
            onRefresh={() => void loadUsage()}
          />
        </div>

        <AiControlPlaneNav activeTab="usage" />

        {error && (
          <div
            aria-live="assertive"
            className="flex flex-wrap items-center gap-3 rounded-card border border-student-status-danger-border bg-student-status-danger-bg p-4 text-sm text-student-status-danger-fg"
            role="alert"
          >
            <AlertCircle className="size-5 shrink-0 text-danger-600" />
            <p className="min-w-0 flex-1">{error}</p>
            <Button
              className="min-h-[44px]"
              disabled={isLoading}
              onClick={() => void loadUsage()}
              size="sm"
              type="button"
              variant="outline"
            >
              Coba lagi
            </Button>
          </div>
        )}

        {isLoading && !data ? (
          <div aria-live="polite" className="grid gap-4 rounded-card border border-primary-100 bg-white p-5 shadow-sm" role="status">
            <div className="h-5 w-56 animate-pulse rounded bg-secondary-100 motion-reduce:animate-none" />
            <div className="h-36 animate-pulse rounded-card bg-secondary-50 motion-reduce:animate-none" />
            <p className="text-sm text-secondary-600">Memuat ringkasan penggunaan dari sumber admin…</p>
          </div>
        ) : null}

        {!isLoading && !data && !error ? (
          <div aria-live="polite" className="rounded-card border border-dashed border-primary-200 bg-primary-50/40 px-5 py-8 text-center" role="status">
            <p className="text-sm font-semibold text-secondary-900">Belum ada data penggunaan</p>
            <p className="mt-1 text-sm text-secondary-600">Segarkan untuk meminta snapshot pada periode yang dipilih.</p>
          </div>
        ) : null}

        {data ? <AiFreshnessBanner freshness={data.freshness} /> : null}

        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <CompactFilterTabs
            aria-label="Ukuran penggunaan"
            items={(Object.keys(METRIC_LABELS) as MetricOption[]).map((option) => ({ label: METRIC_LABELS[option], value: option }))}
            onValueChange={selectMetric}
            value={metric}
          />

          <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-secondary-500">Periode</span>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button type="button" variant="outline" size="sm" className="h-auto min-h-[44px] gap-1.5  text-xs font-bold" />}
              >
                {PERIOD_LABELS[period]}
                <ChevronDown className="size-3.5 text-secondary-400" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuRadioGroup value={period} onValueChange={(value) => selectPeriod(value as PeriodOption)}>
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
            <p className="text-sm text-secondary-600">Data ditampilkan: {METRIC_LABELS[data.metricSelected]} · {formatRange(data.range.from, data.range.to)} (WIB).</p>
            <AiHourlyLockChart quotaHealth={data.quotaHealth} />

            <section className="rounded-card border border-primary-100 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-1 border-b border-primary-50 pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                <div>
                  <h2 className="text-base font-bold text-secondary-950">Pemakaian menurut fitur</h2>
                  <p className="mt-1 text-xs text-secondary-500">
                    Periode {formatRange(data.range.from, data.range.to)} · dikelompokkan berdasarkan fitur Vera
                  </p>
                </div>
              </div>

              {data.items.length === 0 ? (
                <div className="mt-6 rounded-card border border-dashed border-primary-100 bg-primary-50/40 px-4 py-8 text-center">
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
                            <span className="font-bold text-secondary-950">{formatSelectedMetric(item, data.metricSelected)}{data.metricSelected !== "cost" || item.costAvailable ? ` · ${item.sharePercentage}%` : ""}</span>
                          )}
                        </div>
                        <div
                          aria-label={item.privacyState === "suppressed"
                            ? `${formatAiFeatureLabel(item.label)}: Data disembunyikan untuk menjaga privasi siswa.`
                            : data.metricSelected === "cost" && !item.costAvailable ? `${formatAiFeatureLabel(item.label)}: Biaya belum tersedia.`
                            : `${formatAiFeatureLabel(item.label)}: ${item.sharePercentage}% dari total`}
                          className="h-2.5 w-full overflow-hidden rounded-full bg-secondary-100"
                          role="img"
                        >
                          <div
                            style={{ width: `${item.privacyState === "suppressed" ? 0 : item.sharePercentage}%` }}
                            className={`h-full rounded-full transition-[width,background-color] duration-500 motion-reduce:transition-none ${item.privacyState === "suppressed" ? "bg-secondary-300" : "bg-primary-700"}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 overflow-x-auto rounded-card border border-primary-100">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-primary-50/40">
                          <TableHead className="font-bold text-secondary-950">Fitur</TableHead>
                          <TableHead className="font-bold text-secondary-950">API Request</TableHead>
                          <TableHead className="font-bold text-secondary-950">Kuota terpakai</TableHead>
                          <TableHead className="font-bold text-secondary-950">Perkiraan biaya</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium text-secondary-900">{formatAiFeatureLabel(item.label)}</TableCell>
                            {item.privacyState === "suppressed" ? (
                              <TableCell colSpan={3} className="text-xs italic text-secondary-500">
                                Ringkasan disembunyikan untuk menjaga privasi siswa.
                              </TableCell>
                            ) : (
                              <>
                                <TableCell>{item.requests.toLocaleString("id-ID")}</TableCell>
                                <TableCell>{item.quotaUnits.toLocaleString("id-ID")}</TableCell>
                                <TableCell>{item.costAvailable ? formatAiCurrency(item.costUsd * data.cost.exchangeRateIdr) : "Belum tersedia"}</TableCell>
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

            <section className="rounded-card border border-primary-100 bg-white p-6 shadow-sm">
              <div className="border-b border-primary-50 pb-4">
                <h2 className="text-base font-bold text-secondary-950">Perkiraan biaya</h2>
                <p className="mt-1 text-xs text-secondary-500">Biaya tercatat dikonversi dengan kurs acuan Rp{data.cost.exchangeRateIdr.toLocaleString("id-ID")} per dolar AS. Proyeksi mengikuti laju biaya sejak awal bulan (WIB).</p>
                <p className="mt-1 text-xs text-secondary-500">Periode terpilih: {formatReportedCost(data.cost.spendRangeIdr, data.cost.rangeState)}.</p>
                {data.cost.rangeState !== "suppressed" && data.cost.state !== "suppressed" && <p className="mt-1 text-xs text-secondary-500">Cakupan biaya periode: {Math.round(data.cost.costCoverage.knownPercentage)}%; bulan ini: {Math.round(data.cost.monthCoveragePercentage)}%. Angka dengan cakupan sebagian hanya mencakup biaya yang sudah tercatat.</p>}
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4 rounded-card bg-primary-50/40 p-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-secondary-500">Bulan ini</p>
                  <p className="mt-1 text-lg font-extrabold text-secondary-950">{formatReportedCost(data.cost.spendMtdIdr, data.cost.state)}</p>
                </div>
                <div>
                  <p className="text-xs text-secondary-500">Perkiraan akhir bulan</p>
                  <p className="mt-1 text-lg font-extrabold text-secondary-950">{formatReportedCost(data.cost.projectedEomIdr, data.cost.state)}</p>
                </div>
                <div>
                  <p className="text-xs text-secondary-500">Anggaran bulanan</p>
                  <p className="mt-1 text-lg font-extrabold text-secondary-950">{data.cost.monthlyBudgetIdr > 0 ? formatAiCurrency(data.cost.monthlyBudgetIdr) : "Belum ditetapkan"}</p>
                </div>
                <div>
                  <p className="text-xs text-secondary-500">Perkiraan pemakaian anggaran</p>
                  <p className="mt-1 text-lg font-extrabold text-primary-800">{data.cost.monthlyBudgetIdr > 0 && (data.cost.state === "available" || data.cost.state === "partial") ? `${data.cost.projectedUtilizationShare}%` : "Belum tersedia"}</p>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto rounded-card border border-primary-100">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary-50/40">
                      <TableHead className="font-bold text-secondary-950">Fitur</TableHead>
                      <TableHead className="font-bold text-secondary-950">Kuota terpakai</TableHead>
                      <TableHead className="font-bold text-secondary-950">Biaya periode terpilih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.cost.costByCapability.map((capability) => (
                      <TableRow key={capability.capability}>
                        <TableCell className="font-medium text-secondary-900">{formatAiFeatureLabel(capability.capability)}</TableCell>
                        {capability.privacyState === "suppressed" ? <TableCell colSpan={2}>Disembunyikan untuk menjaga privasi siswa.</TableCell> : <>
                          <TableCell>{capability.quotaUnits.toLocaleString("id-ID")}</TableCell>
                          <TableCell>{capability.costAvailable ? formatAiCurrency(capability.spendIdr) : "Belum tersedia"}</TableCell>
                        </>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

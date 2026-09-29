"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Server,
  ShieldCheck,
  Zap,
} from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { PortalShell } from "@/modules/portal/components/portal-shell";
import type { SessionContext } from "@/lib/auth/types";
import type { IncidentSummaryItem, VeraAiReliabilityDto } from "@/lib/admin/ai/contracts";
import { AiControlPlaneNav } from "./components/AiControlPlaneNav";
import { AiFreshnessBanner } from "./components/AiFreshnessBanner";
import { AiRefreshBar } from "./components/AiRefreshBar";
import { AiMetricCard } from "./components/AiMetricCard";
import { cn } from "@/lib/utils";

function formatTtftCaption(
  metric: VeraAiReliabilityDto["metrics"]["p95TimeToFirstTokenMs"],
) {
  if (metric.state === "available" || metric.state === "partial") {
    return `TTFT P95: ${(metric.value / 1000).toFixed(1)}s`;
  }

  return "TTFT P95 belum tersedia";
}

function AiRequestClassificationCard({
  classification,
}: {
  classification: VeraAiReliabilityDto["requestClassification"];
}) {
  return (
    <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-primary-50 pb-4">
        <div>
          <h2 className="text-base font-bold text-secondary-950">Arsitektur Klasifikasi Permintaan</h2>
          <p className="mt-0.5 text-xs text-secondary-500">
            Total {classification.attemptedAdmissions.toLocaleString("id-ID")} percobaan masuk ke sistem Vera
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-primary-200 bg-primary-50/40 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-primary-900">
              Permintaan Diterima & Dieksekusi (Admitted)
            </span>
            <span className="text-sm font-extrabold text-primary-900">
              {classification.admittedRequests.total.toLocaleString("id-ID")}
            </span>
          </div>

          <div className="mt-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-primary-100">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-primary-700" />
                <span className="font-semibold text-secondary-900">Selesai Normal (Primary LLM)</span>
              </div>
              <span className="font-mono font-bold text-secondary-950">
                {classification.admittedRequests.succeeded.toLocaleString("id-ID")}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-primary-100">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-warning-500" />
                <span className="font-semibold text-secondary-900">Pemulihan Fallback (Graceful)</span>
              </div>
              <span className="font-mono font-bold text-secondary-950">
                {classification.admittedRequests.fallback.toLocaleString("id-ID")}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-primary-100">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-student-status-danger-bg0" />
                <span className="font-semibold text-secondary-900">Gagal Terminal (Execution Error)</span>
              </div>
              <span className="font-mono font-bold text-secondary-950">
                {classification.admittedRequests.failed.toLocaleString("id-ID")}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-secondary-200 bg-secondary-50/50 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-secondary-700">
              Ditolak pada Batas Admisi (Not Admitted)
            </span>
            <span className="text-sm font-extrabold text-secondary-900">
              {classification.rejectedAdmissions.total.toLocaleString("id-ID")}
            </span>
          </div>

          <div className="mt-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-secondary-200">
              <span className="font-semibold text-secondary-800">Batas Kuota Harian (Quota Exhausted)</span>
              <span className="font-mono font-bold text-secondary-950">
                {(classification.rejectedAdmissions.byReason?.quota ?? 0).toLocaleString("id-ID")}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-secondary-200">
              <span className="font-semibold text-secondary-800">Pembatasan Laju (Burst / Rate Limited)</span>
              <span className="font-mono font-bold text-secondary-950">
                {(classification.rejectedAdmissions.byReason?.burst ?? 0).toLocaleString("id-ID")}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-secondary-200">
              <span className="font-semibold text-secondary-800">Plafon Konkurensi (Concurrency Cap)</span>
              <span className="font-mono font-bold text-secondary-950">
                {(classification.rejectedAdmissions.byReason?.concurrency ?? 0).toLocaleString("id-ID")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AiGracefulDegradationCard({
  breakdown,
}: {
  breakdown: VeraAiReliabilityDto["metrics"]["gracefulDegradationBreakdown"];
}) {
  return (
    <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-primary-50 pb-4">
        <div>
          <h2 className="text-base font-bold text-secondary-950">Efektivitas Graceful Degradation</h2>
          <p className="mt-0.5 text-xs text-secondary-500">
            Distribusi jalur pemulihan saat model primer mengalami timeout atau degradasi upstream
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <div
          aria-label={`Distribusi graceful degradation: primary LLM ${(breakdown.primaryLlmShare * 100).toFixed(1)}%, model alternatif ${(breakdown.alternativeModelShare * 100).toFixed(1)}%, bank kandidat ${(breakdown.cachedCandidateBankShare * 100).toFixed(1)}%, bank statis ${(breakdown.staticQuestionBankShare * 100).toFixed(1)}%, tidak dapat dipulihkan ${(breakdown.unrecoverableShare * 100).toFixed(1)}%`}
          className="flex h-3.5 w-full overflow-hidden rounded-full bg-secondary-100"
          role="img"
        >
          <div
            style={{ width: `${breakdown.primaryLlmShare * 100}%` }}
            aria-hidden="true"
            className="bg-primary-700"
            title="Primary LLM"
          />
          <div
            style={{ width: `${breakdown.alternativeModelShare * 100}%` }}
            aria-hidden="true"
            className="bg-warning-400"
            title="Model alternatif"
          />
          <div
            style={{ width: `${breakdown.cachedCandidateBankShare * 100}%` }}
            aria-hidden="true"
            className="bg-voyage-leaf"
            title="Bank kandidat tersimpan"
          />
          <div
            style={{ width: `${breakdown.staticQuestionBankShare * 100}%` }}
            aria-hidden="true"
            className="bg-student-status-info-fg"
            title="Bank statis"
          />
          <div
            style={{ width: `${breakdown.unrecoverableShare * 100}%` }}
            aria-hidden="true"
            className="bg-student-status-danger-bg0"
            title="Tidak dapat dipulihkan"
          />
        </div>

        <ul aria-label="Rincian graceful degradation" className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-primary-700" />
            <span className="text-secondary-600">
              Primary LLM: <strong>{(breakdown.primaryLlmShare * 100).toFixed(1)}%</strong>
            </span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-warning-400" />
            <span className="text-secondary-600">
              Alternative Model: <strong>{(breakdown.alternativeModelShare * 100).toFixed(1)}%</strong>
            </span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-voyage-leaf" />
            <span className="text-secondary-600">
              Cached Bank: <strong>{(breakdown.cachedCandidateBankShare * 100).toFixed(1)}%</strong>
            </span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-student-status-info-fg" />
            <span className="text-secondary-600">
              Static Bank: <strong>{(breakdown.staticQuestionBankShare * 100).toFixed(1)}%</strong>
            </span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-student-status-danger-bg0" />
            <span className="text-secondary-600">
              Gagal: <strong>{(breakdown.unrecoverableShare * 100).toFixed(1)}%</strong>
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function AiIncidentTaxonomySection({
  incidentTaxonomy,
  onSelectIncident,
  selectedIncident,
}: {
  incidentTaxonomy: VeraAiReliabilityDto["incidentTaxonomy"];
  onSelectIncident: (item: IncidentSummaryItem) => void;
  selectedIncident: IncidentSummaryItem | null;
}) {
  return (
    <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
      <div className="border-b border-primary-50 pb-4">
        <h2 className="text-base font-bold text-secondary-950">Taksonomi Insiden per Domain Operasional</h2>
        <p className="mt-0.5 text-xs text-secondary-500">
          Insiden dipisahkan berdasarkan domain untuk diagnosis akar masalah yang cepat dan tepat
        </p>
      </div>

      <div className="mt-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-secondary-500 mb-3">
            <ShieldCheck className="size-4 text-primary-700" />
            <span>Domain Batas Admisi (Admission)</span>
          </div>
          <div className="space-y-2">
            {incidentTaxonomy.admission.map((item) => (
              <button
                key={item.label}
                onClick={() => onSelectIncident(item)}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-2xl border p-3.5 text-left text-xs transition-all motion-reduce:transition-none cursor-pointer",
                  selectedIncident?.label === item.label
                    ? "border-primary-600 bg-primary-50/70 shadow-xs"
                    : "border-primary-100 bg-white hover:bg-primary-50/30",
                )}
                aria-pressed={selectedIncident?.label === item.label}
              >
                <div className="flex items-center gap-3">
                  <AlertCircle className="size-4 text-primary-700 shrink-0" />
                  <div>
                    <p className="font-bold text-secondary-900">{item.label}</p>
                    <p className="text-secondary-500">{item.count.toLocaleString("id-ID")} kejadian ({(item.rate * 100).toFixed(2)}%)</p>
                  </div>
                </div>
                <span className="rounded-full bg-primary-100 px-2.5 py-0.5 font-bold uppercase text-[10px] text-primary-800">
                  {item.severity}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-secondary-500 mb-3">
            <Server className="size-4 text-primary-700" />
            <span>Domain Infrastruktur (Infrastructure)</span>
          </div>
          <div className="space-y-2">
            {incidentTaxonomy.infrastructure.map((item) => (
              <button
                key={item.label}
                onClick={() => onSelectIncident(item)}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-2xl border p-3.5 text-left text-xs transition-all motion-reduce:transition-none cursor-pointer",
                  selectedIncident?.label === item.label
                    ? "border-primary-600 bg-primary-50/70 shadow-xs"
                    : "border-primary-100 bg-white hover:bg-primary-50/30",
                )}
                aria-pressed={selectedIncident?.label === item.label}
              >
                <div className="flex items-center gap-3">
                  <AlertCircle
                    className={cn(
                      "size-4 shrink-0",
                      item.severity === "warning" ? "text-warning-600" : "text-primary-700",
                    )}
                  />
                  <div>
                    <p className="font-bold text-secondary-900">{item.label}</p>
                    <p className="text-secondary-500">{item.count.toLocaleString("id-ID")} kejadian ({(item.rate * 100).toFixed(3)}%)</p>
                  </div>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 font-bold uppercase text-[10px]",
                    item.severity === "warning"
                      ? "bg-warning-100 text-warning-800"
                      : "bg-primary-100 text-primary-800",
                  )}
                >
                  {item.severity}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-secondary-500 mb-3">
            <Zap className="size-4 text-primary-700" />
            <span>Domain Upstream Provider</span>
          </div>
          <div className="space-y-2">
            {incidentTaxonomy.upstream.map((item) => (
              <button
                key={item.label}
                onClick={() => onSelectIncident(item)}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-2xl border p-3.5 text-left text-xs transition-all motion-reduce:transition-none cursor-pointer",
                  selectedIncident?.label === item.label
                    ? "border-primary-600 bg-primary-50/70 shadow-xs"
                    : "border-primary-100 bg-white hover:bg-primary-50/30",
                )}
                aria-pressed={selectedIncident?.label === item.label}
              >
                <div className="flex items-center gap-3">
                  <AlertCircle
                    className={cn(
                      "size-4 shrink-0",
                      item.severity === "warning" ? "text-warning-600" : "text-primary-700",
                    )}
                  />
                  <div>
                    <p className="font-bold text-secondary-900">{item.label}</p>
                    <p className="text-secondary-500">{item.count.toLocaleString("id-ID")} kejadian (+{item.changePp} pp)</p>
                  </div>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 font-bold uppercase text-[10px]",
                    item.severity === "warning"
                      ? "bg-warning-100 text-warning-800"
                      : "bg-primary-100 text-primary-800",
                  )}
                >
                  {item.severity}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AiIncidentCohortDrilldown({
  selectedIncident,
}: {
  selectedIncident: IncidentSummaryItem | null;
}) {
  return (
    <div className="sticky top-24 rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
      <div className="border-b border-primary-50 pb-4">
        <h2 className="text-base font-bold text-secondary-950">Detail Cohort Insiden</h2>
        <p className="mt-0.5 text-xs text-secondary-500">
          {selectedIncident ? selectedIncident.label : "Pilih insiden untuk melihat rincian agregat"}
        </p>
      </div>

      {selectedIncident ? (
        <div className="mt-5 space-y-4 text-xs">
          <div>
            <span className="font-bold text-secondary-500 uppercase tracking-wider text-[10px]">
              Domain Operasional
            </span>
            <p className="font-extrabold text-secondary-950 text-sm capitalize mt-0.5">
              {selectedIncident.domain}
            </p>
          </div>

          {selectedIncident.affectedFeatures && (
            <div>
              <span className="font-bold text-secondary-500 uppercase tracking-wider text-[10px]">
                Fitur Terdampak
              </span>
              <div className="mt-2 space-y-1.5">
                {selectedIncident.affectedFeatures.map((f) => (
                  <div key={f.feature} className="flex items-center justify-between">
                    <span className="font-mono text-secondary-800">{f.feature}</span>
                    <span className="font-bold text-secondary-950">{f.share}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedIncident.affectedGateways && (
            <div>
              <span className="font-bold text-secondary-500 uppercase tracking-wider text-[10px]">
                Gateway Terdampak
              </span>
              <div className="mt-2 space-y-1.5">
                {selectedIncident.affectedGateways.map((g) => (
                  <div key={g.gateway} className="flex items-center justify-between">
                    <span className="text-secondary-800">{g.gateway}</span>
                    <span className="font-bold text-secondary-950">{g.share}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedIncident.p95LatencyMs && (
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary-50 p-2.5">
              <div>
                <span className="text-[10px] text-secondary-500">Latensi P50</span>
                <p className="font-bold text-secondary-950">{selectedIncident.p50LatencyMs} ms</p>
              </div>
              <div>
                <span className="text-[10px] text-secondary-500">Latensi P95</span>
                <p className="font-bold text-secondary-950">{selectedIncident.p95LatencyMs} ms</p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-3">
            <div className="flex items-center gap-1.5 text-primary-800 font-bold text-xs">
              <ShieldCheck className="size-3.5" />
              <span>Batas Privasi Siswa Terjaga</span>
            </div>
            <p className="mt-1 text-[11px] text-secondary-600">
              Data percakapan siswa tidak pernah dimuat atau terekspos ke dalam lapisan diagnosa ini.
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-5 text-xs text-secondary-500 italic">
          Pilih salah satu insiden untuk menampilkan detail agregat.
        </p>
      )}
    </div>
  );
}

export function AiReliabilityPageModule({ session }: { session: SessionContext }) {
  const [data, setData] = useState<VeraAiReliabilityDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<IncidentSummaryItem | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const loadReliability = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai/reliability", { cache: "no-store" });
      if (!res.ok) throw new Error("Gagal memuat data keandalan sistem.");
      const json = (await res.json()) as VeraAiReliabilityDto;
      setData(json);
      setLastRefreshedAt(new Date());
      const allIncidents = [
        ...json.incidentTaxonomy.admission,
        ...json.incidentTaxonomy.infrastructure,
        ...json.incidentTaxonomy.upstream,
        ...json.incidentTaxonomy.application,
      ];
      const withDrilldown = allIncidents.find((i) => i.affectedFeatures?.length);
      if (withDrilldown) setSelectedIncident(withDrilldown);
    } catch {
      setError("Data keandalan Vera AI belum berhasil dimuat. Segarkan halaman untuk mencoba lagi.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReliability();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadReliability]);

  return (
    <PortalShell
      activeAdminSection="ai"
      audience="admin"
      description="Pemisahan tegas antara penolakan batas admisi (kuota/burst) dan keandalan eksekusi model/upstream provider."
      session={session}
      title="Keandalan & Insiden"
    >
      <div className="space-y-6">
        {/* Header Title */}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-secondary-950 sm:text-3xl">
             Keandalan & Insiden
          </h1>
          <p className="mt-1 text-sm text-secondary-600">
            Pemisahan tegas antara penolakan batas admisi (kuota/burst) dan keandalan eksekusi sistem/upstream provider.
          </p>
        </div>

        {/* Tab Navigation (Full-width line tab variant) */}
        <AiControlPlaneNav activeTab="reliability" />

        {/* Refresh Bar */}
        <AiRefreshBar
          lastRefreshedAt={lastRefreshedAt}
          isLoading={isLoading}
          onRefresh={() => void loadReliability()}
        />

        {error && (
          <div aria-live="assertive" className="flex flex-wrap items-center gap-3 rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg p-4 text-sm text-student-status-danger-fg" role="alert">
            <AlertCircle className="size-5 shrink-0 text-danger-600" />
            <p className="min-w-0 flex-1">{error}</p>
            <Button disabled={isLoading} onClick={() => void loadReliability()} size="default" type="button" variant="brandOutline">
              Coba lagi
            </Button>
          </div>
        )}

        {isLoading && !data ? (
          <div aria-live="polite" className="grid gap-4 rounded-3xl border border-primary-100 bg-white p-5 shadow-sm" role="status">
            <div className="h-5 w-56 animate-pulse rounded bg-secondary-100 motion-reduce:animate-none" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {["metric-1", "metric-2", "metric-3", "metric-4", "metric-5", "metric-6"].map((key) => (
                <div className="h-24 animate-pulse rounded-2xl bg-secondary-50 motion-reduce:animate-none" key={key} />
              ))}
            </div>
            <p className="text-sm text-secondary-600">Memuat data keandalan dari sumber admin…</p>
          </div>
        ) : null}

        {!isLoading && !data && !error ? (
          <div className="rounded-3xl border border-dashed border-primary-200 bg-primary-50/40 px-5 py-8 text-center" role="status">
            <p className="text-sm font-semibold text-secondary-900">Belum ada data keandalan</p>
            <p className="mt-1 text-sm text-secondary-600">Segarkan untuk meminta snapshot insiden terbaru.</p>
          </div>
        ) : null}

        {data ? <AiFreshnessBanner freshness={data.freshness} /> : null}

        {data && (
          <div className="space-y-6">
            <AiRequestClassificationCard classification={data.requestClassification} />

            {/* Explicit Metric Cards Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <AiMetricCard
                title="Tingkat Keberhasilan Selesai"
                metric={data.metrics.executionSuccessRate}
                subCaption="normal / terminal"
              />
              <AiMetricCard
                title="Penyelesaian Efektif"
                metric={data.metrics.effectiveCompletionRate}
                subCaption="(sukses + fb) / terminal"
              />
              <AiMetricCard
                title="Tingkat Fallback"
                metric={data.metrics.fallbackRate}
                subCaption="fallback / terminal"
              />
              <AiMetricCard
                title="Penolakan Batas Admisi"
                metric={data.metrics.admissionRejectionRate}
                subCaption="ditolak / dicoba"
              />
              <AiMetricCard
                title="Pemulihan Fallback"
                metric={data.metrics.fallbackRecoveryRate}
                subCaption="efektivitas pemulihan"
              />
              <AiMetricCard
                title="Latensi P95"
                metric={data.metrics.p95LatencyMs}
                subCaption={formatTtftCaption(data.metrics.p95TimeToFirstTokenMs)}
              />
            </div>

            <AiGracefulDegradationCard breakdown={data.metrics.gracefulDegradationBreakdown} />

            {/* Incident Taxonomy Grouped By Operational Domain */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Left 2 Cols: Incident Groups */}
              <div className="space-y-6 lg:col-span-2">
                <AiIncidentTaxonomySection
                  incidentTaxonomy={data.incidentTaxonomy}
                  onSelectIncident={(item) => setSelectedIncident(item)}
                  selectedIncident={selectedIncident}
                />
              </div>

              {/* Right Col: Privacy-Safe Incident Cohort Drilldown */}
              <div>
                <AiIncidentCohortDrilldown selectedIncident={selectedIncident} />
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Server,
  ShieldCheck,
  Zap,
} from "@/lib/icons";
import { PortalShell } from "@/modules/portal/components/portal-shell";
import type { SessionContext } from "@/lib/auth/types";
import type { IncidentSummaryItem, VeraAiReliabilityDto } from "@/lib/admin/ai/contracts";
import { AiControlPlaneNav } from "./components/AiControlPlaneNav";
import { AiRefreshBar } from "./components/AiRefreshBar";
import { AiMetricCard } from "./components/AiMetricCard";
import { cn } from "@/lib/utils";

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan sistem.");
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
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle className="size-5 shrink-0 text-red-600" />
            <p>{error}</p>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Request Classification Architecture Card */}
            <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-primary-50 pb-4">
                <div>
                  <h3 className="text-base font-bold text-secondary-950">Arsitektur Klasifikasi Permintaan</h3>
                  <p className="mt-0.5 text-xs text-secondary-500">
                    Total {data.requestClassification.attemptedAdmissions.toLocaleString("id-ID")} percobaan masuk ke sistem Vera
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                {/* Admitted Class */}
                <div className="rounded-2xl border border-primary-200 bg-primary-50/40 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary-900">
                      Permintaan Diterima & Dieksekusi (Admitted)
                    </span>
                    <span className="text-sm font-extrabold text-primary-900">
                      {data.requestClassification.admittedRequests.total.toLocaleString("id-ID")}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-primary-100">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-primary-700" />
                        <span className="font-semibold text-secondary-800">Berhasil (Primary Model)</span>
                      </div>
                      <span className="font-extrabold text-secondary-950">
                        {data.requestClassification.admittedRequests.succeeded.toLocaleString("id-ID")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-amber-200">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-amber-500" />
                        <span className="font-semibold text-secondary-800">Berhasil Lewat Fallback</span>
                      </div>
                      <span className="font-extrabold text-secondary-950">
                        {data.requestClassification.admittedRequests.fallback.toLocaleString("id-ID")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-red-200">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-red-500" />
                        <span className="font-semibold text-secondary-800">Gagal Eksekusi Total</span>
                      </div>
                      <span className="font-extrabold text-secondary-950">
                        {data.requestClassification.admittedRequests.failed.toLocaleString("id-ID")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Rejected Class */}
                <div className="rounded-2xl border border-secondary-200 bg-secondary-50/50 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-secondary-700">
                      Ditolak Sebelum Eksekusi (Blocked Admissions)
                    </span>
                    <span className="text-sm font-extrabold text-secondary-950">
                      {data.requestClassification.rejectedAdmissions.total.toLocaleString("id-ID")}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-secondary-200">
                      <span className="font-semibold text-secondary-800">Batas Kuota Harian Habis</span>
                      <span className="font-bold text-secondary-950">
                        {data.requestClassification.rejectedAdmissions.byReason.quota.toLocaleString("id-ID")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-secondary-200">
                      <span className="font-semibold text-secondary-800">Kunci Batas Overrun Kuota</span>
                      <span className="font-bold text-secondary-950">
                        {data.requestClassification.rejectedAdmissions.byReason.quota_overrun_lock.toLocaleString("id-ID")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-secondary-200">
                      <span className="font-semibold text-secondary-800">Melebihi Batas Burst Jendela 10m</span>
                      <span className="font-bold text-secondary-950">
                        {data.requestClassification.rejectedAdmissions.byReason.burst.toLocaleString("id-ID")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-secondary-200">
                      <span className="font-semibold text-secondary-800">Batas Konkurensi Per Pengguna</span>
                      <span className="font-bold text-secondary-950">
                        {data.requestClassification.rejectedAdmissions.byReason.concurrency.toLocaleString("id-ID")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Explicit Metric Cards Grid */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
              <AiMetricCard
                title="Keberhasilan Eksekusi"
                metric={data.metrics.executionSuccessRate}
                 subCaption="sukses / terminal"
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
                subCaption="TTFT P95: 1.4s"
              />
            </div>

            {/* Graceful Degradation Breakdown */}
            <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-primary-50 pb-4">
                <div>
                  <h3 className="text-base font-bold text-secondary-950">Efektivitas Graceful Degradation</h3>
                  <p className="mt-0.5 text-xs text-secondary-500">
                    Distribusi jalur pemulihan saat model primer mengalami timeout atau degradasi upstream
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-secondary-100">
                  <div
                    style={{ width: `${data.metrics.gracefulDegradationBreakdown.primaryLlmShare * 100}%` }}
                    className="bg-primary-700"
                    title="Primary LLM"
                  />
                  <div
                    style={{ width: `${data.metrics.gracefulDegradationBreakdown.alternativeModelShare * 100}%` }}
                    className="bg-amber-400"
                       title="Model alternatif"
                  />
                  <div
                    style={{ width: `${data.metrics.gracefulDegradationBreakdown.cachedCandidateBankShare * 100}%` }}
                    className="bg-teal-500"
                       title="Bank kandidat tersimpan"
                  />
                  <div
                    style={{ width: `${data.metrics.gracefulDegradationBreakdown.staticQuestionBankShare * 100}%` }}
                    className="bg-purple-500"
                       title="Bank statis"
                  />
                  <div
                    style={{ width: `${data.metrics.gracefulDegradationBreakdown.unrecoverableShare * 100}%` }}
                    className="bg-red-500"
                       title="Tidak dapat dipulihkan"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-primary-700" />
                    <span className="text-secondary-600">
                      Primary LLM: <strong>{(data.metrics.gracefulDegradationBreakdown.primaryLlmShare * 100).toFixed(1)}%</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-amber-400" />
                    <span className="text-secondary-600">
                      Alternative Model: <strong>{(data.metrics.gracefulDegradationBreakdown.alternativeModelShare * 100).toFixed(1)}%</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-teal-500" />
                    <span className="text-secondary-600">
                      Cached Bank: <strong>{(data.metrics.gracefulDegradationBreakdown.cachedCandidateBankShare * 100).toFixed(1)}%</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-purple-500" />
                    <span className="text-secondary-600">
                      Static Bank: <strong>{(data.metrics.gracefulDegradationBreakdown.staticQuestionBankShare * 100).toFixed(1)}%</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-red-500" />
                    <span className="text-secondary-600">
                      Gagal: <strong>{(data.metrics.gracefulDegradationBreakdown.unrecoverableShare * 100).toFixed(1)}%</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Incident Taxonomy Grouped By Operational Domain */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Left 2 Cols: Incident Groups */}
              <div className="space-y-6 lg:col-span-2">
                <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
                  <div className="border-b border-primary-50 pb-4">
                    <h3 className="text-base font-bold text-secondary-950">Taksonomi Insiden per Domain Operasional</h3>
                    <p className="mt-0.5 text-xs text-secondary-500">
                      Insiden dipisahkan berdasarkan domain untuk diagnosis akar masalah yang cepat dan tepat
                    </p>
                  </div>

                  <div className="mt-6 space-y-6">
                    {/* Domain 1: Admission */}
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-secondary-500 mb-3">
                        <ShieldCheck className="size-4 text-primary-700" />
                        <span>Domain Batas Admisi (Admission)</span>
                      </div>
                      <div className="space-y-2">
                        {data.incidentTaxonomy.admission.map((item) => (
                          <div
                            key={item.label}
                            onClick={() => setSelectedIncident(item)}
                            className={cn(
                              "flex items-center justify-between rounded-2xl border p-3.5 text-xs transition-all cursor-pointer",
                              selectedIncident?.label === item.label
                                ? "border-primary-600 bg-primary-50/70 shadow-xs"
                                : "border-primary-100 bg-white hover:bg-primary-50/30",
                            )}
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
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Domain 2: Infrastructure */}
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-secondary-500 mb-3">
                        <Server className="size-4 text-primary-700" />
                        <span>Domain Infrastruktur (Infrastructure)</span>
                      </div>
                      <div className="space-y-2">
                        {data.incidentTaxonomy.infrastructure.map((item) => (
                          <div
                            key={item.label}
                            onClick={() => setSelectedIncident(item)}
                            className={cn(
                              "flex items-center justify-between rounded-2xl border p-3.5 text-xs transition-all cursor-pointer",
                              selectedIncident?.label === item.label
                                ? "border-primary-600 bg-primary-50/70 shadow-xs"
                                : "border-primary-100 bg-white hover:bg-primary-50/30",
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <AlertCircle
                                className={cn(
                                  "size-4 shrink-0",
                                  item.severity === "warning" ? "text-amber-600" : "text-primary-700",
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
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-primary-100 text-primary-800",
                              )}
                            >
                              {item.severity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Domain 3: Upstream */}
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-secondary-500 mb-3">
                        <Zap className="size-4 text-primary-700" />
                        <span>Domain Upstream Provider</span>
                      </div>
                      <div className="space-y-2">
                        {data.incidentTaxonomy.upstream.map((item) => (
                          <div
                            key={item.label}
                            onClick={() => setSelectedIncident(item)}
                            className={cn(
                              "flex items-center justify-between rounded-2xl border p-3.5 text-xs transition-all cursor-pointer",
                              selectedIncident?.label === item.label
                                ? "border-primary-600 bg-primary-50/70 shadow-xs"
                                : "border-primary-100 bg-white hover:bg-primary-50/30",
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <AlertCircle
                                className={cn(
                                  "size-4 shrink-0",
                                  item.severity === "warning" ? "text-amber-600" : "text-primary-700",
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
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-primary-100 text-primary-800",
                              )}
                            >
                              {item.severity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Col: Privacy-Safe Incident Cohort Drilldown */}
              <div>
                <div className="sticky top-24 rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
                  <div className="border-b border-primary-50 pb-4">
                    <h3 className="text-base font-bold text-secondary-950">Detail Cohort Insiden</h3>
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
                      Klik salah satu insiden untuk menampilkan detail agregat.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

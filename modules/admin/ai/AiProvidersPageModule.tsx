"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { PortalShell } from "@/modules/portal/components/portal-shell";
import type { SessionContext } from "@/lib/auth/types";
import type { VeraAiProvidersDto } from "@/lib/admin/ai/contracts";
import { AiControlPlaneNav } from "./components/AiControlPlaneNav";
import { AiFreshnessBanner } from "./components/AiFreshnessBanner";
import { AiCapacityMeter } from "./components/AiCapacityMeter";
import { AiRoutingChainVisualizer } from "./components/AiRoutingChainVisualizer";
import { cn } from "@/lib/utils";

export function AiProvidersPageModule({ session }: { session: SessionContext }) {
  const [data, setData] = useState<VeraAiProvidersDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai/providers", { cache: "no-store" });
      if (!res.ok) throw new Error("Gagal memuat status provider & gateway.");
      const json = (await res.json()) as VeraAiProvidersDto;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan sistem.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProviders();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProviders]);

  return (
    <PortalShell
      activeAdminSection="ai"
      audience="admin"
      description="Kesehatan gateway upstream, audit sidik jari kredensial, dan visualisasi rantai fallback per kemampuan."
      session={session}
      title="Provider & Routing"
    >
      <div className="space-y-6">
        {/* Header Title */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-secondary-950 sm:text-3xl">
              Provider & Routing
            </h1>
            <p className="mt-1 text-sm text-secondary-600">
              Observasi kesehatan gateway upstream, audit sidik jari kredensial tanpa membuka rahasia, dan visualisasi rantai routing per kemampuan.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              disabled={isLoading}
              onClick={() => void loadProviders()}
              type="button"
              variant="reference"
              className="gap-2"
            >
              <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
               <span>Segarkan</span>
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <AiControlPlaneNav activeTab="providers" />

        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle className="size-5 shrink-0 text-red-600" />
            <p>{error}</p>
          </div>
        )}

        {data && <AiFreshnessBanner freshness={data.freshness} />}

        {data && (
          <div className="space-y-6">
            {/* Gateways Health Cards */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-secondary-950">Gateway Upstream</h3>
                <span className="text-xs text-secondary-500">
                   {data.gateways.filter((g) => g.status === "healthy").length} dari {data.gateways.length} gateway aktif
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {data.gateways.map((gw) => {
                  const isHealthy = gw.status === "healthy";
                  const isDisabled = gw.status === "disabled";

                  return (
                    <div
                      key={gw.gateway}
                      className={cn(
                        "rounded-3xl border p-5 shadow-sm transition-all",
                        isDisabled
                          ? "border-secondary-200 bg-secondary-50/50 opacity-75"
                          : isHealthy
                          ? "border-primary-100 bg-white"
                          : "border-amber-200 bg-amber-50/20",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-secondary-950">{gw.label}</span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase",
                            isDisabled
                              ? "bg-secondary-200 text-secondary-700"
                              : isHealthy
                              ? "bg-primary-50 text-primary-800 border border-primary-100"
                              : "bg-amber-100 text-amber-800",
                          )}
                        >
                          {isHealthy && <CheckCircle2 className="size-3" />}
                          {isDisabled ? "Nonaktif" : isHealthy ? "Aktif & Sehat" : "Terdegradasi"}
                        </span>
                      </div>

                      {!isDisabled ? (
                        <div className="mt-4 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-secondary-500">Porsi Lalu Lintas</span>
                            <span className="font-bold text-secondary-950">{gw.trafficShare}%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-secondary-500">Tingkat Berhasil</span>
                            <span className="font-bold text-secondary-950">{gw.successRate}%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-secondary-500">Latensi P95</span>
                            <span className="font-bold text-secondary-950">{gw.p95LatencySec} s</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-secondary-500">Pemicu Fallback</span>
                            <span className="font-bold text-secondary-950">{gw.fallbackTriggeredRate}%</span>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-4 text-xs text-secondary-500">Dinonaktifkan di lingkungan produksi.</p>
                      )}

                      {/* Credential Fingerprint */}
                      <div className="mt-4 rounded-xl border border-secondary-100 bg-secondary-50/70 p-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-secondary-600">{gw.credentialFingerprint}</span>
                          <span className="font-bold text-[10px] text-primary-700 uppercase">
                            {gw.credentialHealth === "valid" ? "VALID & TERVERIFIKASI" : gw.credentialHealth}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-secondary-400">Rotasi terakhir: {gw.lastRotatedDate}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Capacity Headroom */}
            <AiCapacityMeter capacity={data.capacityHeadroom} />

            {/* Capability Routing Chain Visualizer */}
            <div>
              <div className="mb-4">
                <h3 className="text-base font-bold text-secondary-950">
                  Rantai Routing Kemampuan: Konfigurasi vs Perilaku Aktual
                </h3>
                <p className="mt-0.5 text-xs text-secondary-500">
                  Perbandingan jalur eksekusi yang dikonfigurasi dengan hasil observasi penyelesaian aktual 24 jam terakhir
                </p>
              </div>

              <AiRoutingChainVisualizer routes={data.capabilityRoutes} />
            </div>

          </div>
        )}
      </div>
    </PortalShell>
  );
}

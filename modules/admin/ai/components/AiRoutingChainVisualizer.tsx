"use client";

import { ArrowRight } from "@/lib/icons";
import type { CapabilityRoutingInfo } from "@/lib/admin/ai/contracts";

export function AiRoutingChainVisualizer({ routes }: { routes: CapabilityRoutingInfo[] }) {
  return (
    <div className="space-y-4">
      {routes.map((r) => {
        const { capability, label, configuredChain, observedLast24h } = r;

        return (
          <div
            key={capability}
            className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm"
          >
            <div className="flex flex-col justify-between gap-2 border-b border-primary-50 pb-4 sm:flex-row sm:items-center">
              <div>
                <h4 className="text-base font-extrabold text-secondary-950">{label}</h4>
                <p className="text-xs text-secondary-500 font-mono">{capability}</p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-full bg-secondary-100 px-2.5 py-1 font-semibold text-secondary-700">
                  Timeout: {configuredChain.timeoutMs} ms
                </span>
                <span className="rounded-full bg-secondary-100 px-2.5 py-1 font-semibold text-secondary-700">
                  {configuredChain.retryPolicy === "2 attempts, exponential backoff" ? "2x Percobaan (Exponential Backoff)" : configuredChain.retryPolicy}
                </span>
              </div>
            </div>

            {/* Configured Routing Chain */}
            <div className="mt-4">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary-400">
                Rantai Eksekusi Terkonfigurasi
              </span>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <div className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-primary-900 font-medium">
                  <span className="text-[10px] font-bold uppercase text-primary-700 block">Primary Model</span>
                  <span>{configuredChain.primary.gateway} → {configuredChain.primary.model}</span>
                </div>

                {configuredChain.fallback1 && (
                  <>
                    <ArrowRight className="size-4 text-secondary-400" />
                    <div className="rounded-xl border border-secondary-200 bg-secondary-50 px-3 py-2 text-secondary-800 font-medium">
                      <span className="text-[10px] font-bold uppercase text-secondary-500 block">Fallback 1</span>
                      <span>{configuredChain.fallback1.gateway} → {configuredChain.fallback1.model}</span>
                    </div>
                  </>
                )}

                {configuredChain.fallback2 && (
                  <>
                    <ArrowRight className="size-4 text-secondary-400" />
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 font-medium">
                      <span className="text-[10px] font-bold uppercase text-amber-700 block">Fallback 2</span>
                      <span>{configuredChain.fallback2.label}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Observed Behavior (Last 24 Hours) */}
            <div className="mt-5 rounded-2xl bg-secondary-50/70 p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-secondary-800">Observasi Penyelesaian Aktual (24 Jam Terakhir)</span>
                <span className="text-secondary-500">
                  Primary Model: {observedLast24h.primaryCompletionShare}%
                </span>
              </div>

              <div className="mt-2.5 flex h-3 w-full overflow-hidden rounded-full bg-secondary-200">
                <div
                  style={{ width: `${observedLast24h.primaryCompletionShare}%` }}
                  className="bg-primary-700"
                  title={`Primary: ${observedLast24h.primaryCompletionShare}%`}
                />
                <div
                  style={{ width: `${observedLast24h.modelFallbackShare}%` }}
                  className="bg-amber-500"
                  title={`Model Fallback: ${observedLast24h.modelFallbackShare}%`}
                />
                <div
                  style={{ width: `${observedLast24h.staticFallbackShare}%` }}
                  className="bg-purple-500"
                  title={`Static Fallback: ${observedLast24h.staticFallbackShare}%`}
                />
                <div
                  style={{ width: `${observedLast24h.failedShare}%` }}
                  className="bg-red-500"
                  title={`Gagal: ${observedLast24h.failedShare}%`}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-primary-700" />
                  <span className="text-secondary-600">
                    Selesai di Primary: <strong className="text-secondary-950">{observedLast24h.primaryCompletionShare}%</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-amber-500" />
                  <span className="text-secondary-600">
                    Selesai lewat Model Fallback: <strong className="text-secondary-950">{observedLast24h.modelFallbackShare}%</strong>
                  </span>
                </div>
                {observedLast24h.staticFallbackShare > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-purple-500" />
                    <span className="text-secondary-600">
                      Fallback Statis: <strong className="text-secondary-950">{observedLast24h.staticFallbackShare}%</strong>
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-red-500" />
                  <span className="text-secondary-600">
                    Gagal: <strong className="text-secondary-950">{observedLast24h.failedShare}%</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

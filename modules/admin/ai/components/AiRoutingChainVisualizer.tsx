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
            <div className="flex min-w-0 flex-col justify-between gap-2 border-b border-primary-50 pb-4 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-secondary-950">{label}</h3>
                <p className="text-xs text-secondary-500 font-mono">{capability}</p>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                <span className="max-w-full break-words rounded-full bg-secondary-100 px-2.5 py-1 font-semibold text-secondary-700">
                  Timeout: {configuredChain.timeoutMs} ms
                </span>
                <span className="max-w-full break-words rounded-full bg-secondary-100 px-2.5 py-1 font-semibold text-secondary-700">
                  {configuredChain.retryPolicy === "2 attempts, exponential backoff" ? "2x Percobaan (Exponential Backoff)" : configuredChain.retryPolicy}
                </span>
              </div>
            </div>

            {/* Configured Routing Chain */}
            <div className="mt-4">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary-400">
                Rantai Eksekusi Terkonfigurasi
              </span>
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs">
                <div className="min-w-0 max-w-full rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 font-medium text-primary-900">
                  <span className="text-[10px] font-bold uppercase text-primary-700 block">Primary Model</span>
                  <span className="break-words">{configuredChain.primary.gateway} → {configuredChain.primary.model}</span>
                </div>

                {configuredChain.fallback1 && (
                  <>
                    <ArrowRight className="size-4 text-secondary-400" />
                    <div className="min-w-0 max-w-full rounded-xl border border-secondary-200 bg-secondary-50 px-3 py-2 font-medium text-secondary-800">
                      <span className="text-[10px] font-bold uppercase text-secondary-500 block">Fallback 1</span>
                    <span className="break-words">{configuredChain.fallback1.gateway} → {configuredChain.fallback1.model}</span>
                    </div>
                  </>
                )}

                {configuredChain.fallback2 && (
                  <>
                    <ArrowRight className="size-4 text-secondary-400" />
                    <div className="min-w-0 max-w-full rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 font-medium text-warning-900">
                      <span className="text-[10px] font-bold uppercase text-warning-700 block">Fallback 2</span>
                    <span className="break-words">{configuredChain.fallback2.label}</span>
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

              <div
                aria-label={`Penyelesaian aktual untuk ${label}: primary ${observedLast24h.primaryCompletionShare}%, fallback model ${observedLast24h.modelFallbackShare}%, fallback statis ${observedLast24h.staticFallbackShare}%, gagal ${observedLast24h.failedShare}%`}
                className="mt-2.5 flex h-3 w-full overflow-hidden rounded-full bg-secondary-200"
                role="img"
              >
                <div
                  aria-hidden="true"
                  style={{ width: `${observedLast24h.primaryCompletionShare}%` }}
                  className="bg-primary-700"
                  title={`Primary: ${observedLast24h.primaryCompletionShare}%`}
                />
                <div
                  aria-hidden="true"
                  style={{ width: `${observedLast24h.modelFallbackShare}%` }}
                  className="bg-warning-500"
                  title={`Model Fallback: ${observedLast24h.modelFallbackShare}%`}
                />
                <div
                  aria-hidden="true"
                  style={{ width: `${observedLast24h.staticFallbackShare}%` }}
                  className="bg-student-status-info-fg"
                  title={`Static Fallback: ${observedLast24h.staticFallbackShare}%`}
                />
                <div
                  aria-hidden="true"
                  style={{ width: `${observedLast24h.failedShare}%` }}
                  className="bg-student-status-danger-bg0"
                  title={`Gagal: ${observedLast24h.failedShare}%`}
                />
              </div>

              <ul aria-label="Rincian penyelesaian aktual" className="mt-3 flex list-none flex-wrap items-center justify-between gap-2 p-0 text-xs">
                <li className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-primary-700" />
                  <span className="text-secondary-600">
                    Selesai di Primary: <strong className="text-secondary-950">{observedLast24h.primaryCompletionShare}%</strong>
                  </span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-warning-500" />
                  <span className="text-secondary-600">
                    Selesai lewat Model Fallback: <strong className="text-secondary-950">{observedLast24h.modelFallbackShare}%</strong>
                  </span>
                </li>
                {observedLast24h.staticFallbackShare > 0 && (
                  <li className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-student-status-info-fg" />
                    <span className="text-secondary-600">
                      Fallback Statis: <strong className="text-secondary-950">{observedLast24h.staticFallbackShare}%</strong>
                    </span>
                  </li>
                )}
                <li className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-student-status-danger-bg0" />
                  <span className="text-secondary-600">
                    Gagal: <strong className="text-secondary-950">{observedLast24h.failedShare}%</strong>
                  </span>
                </li>
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}

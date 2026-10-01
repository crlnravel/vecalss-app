"use client";

import { AlertTriangle, CheckCircle2, ShieldAlert } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { SystemCapacityMetrics } from "@/lib/admin/ai/contracts";

export function AiCapacityMeter({ capacity }: { capacity: SystemCapacityMetrics }) {
  const items = [
    { label: "Kapasitas Kuota Harian", value: capacity.quotaCapacityShare, status: capacity.quotaStatus },
    { label: "Batas Konkurensi Sistem", value: capacity.concurrencyShare, status: capacity.concurrencyStatus },
     { label: "Provider RPM (request/menit)", value: capacity.providerRpmShare, status: capacity.providerRpmStatus },
     { label: "Provider TPM (token/menit)", value: capacity.providerTpmShare, status: capacity.providerTpmStatus },
     { label: "Kedalaman antrean (queue depth)", value: capacity.queueDepthShare, status: capacity.queueDepthStatus },
  ];

  return (
    <div className="rounded-card border border-primary-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-primary-50 pb-4">
        <div>
          <h2 className="text-base font-bold text-secondary-950">Kapasitas & Headroom Sistem Vera AI</h2>
          <p className="mt-0.5 text-xs text-secondary-500">
            Deteksi dini beban puncak sistem sebelum berdampak pada antrean atau latensi siswa
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {items.map((item) => {
          const isCritical = item.status === "critical";
          const isElevated = item.status === "elevated";

          return (
            <div key={item.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-secondary-800">{item.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-secondary-950">{item.value}%</span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                      isCritical
                        ? "bg-student-status-danger-bg text-student-status-danger-fg border border-student-status-danger-border"
                        : isElevated
                        ? "bg-warning-50 text-warning-700 border border-warning-200"
                        : "bg-primary-50 text-primary-700 border border-primary-100",
                    )}
                  >
                    {isCritical ? (
                      <ShieldAlert className="size-3" />
                    ) : isElevated ? (
                      <AlertTriangle className="size-3" />
                    ) : (
                      <CheckCircle2 className="size-3" />
                    )}
                    {item.status}
                  </span>
                </div>
              </div>

              <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary-100">
                <meter
                  aria-label={item.label}
                  className="sr-only"
                  max={100}
                  min={0}
                  value={Math.max(0, Math.min(100, item.value))}
                >
                  {`${item.value}% ${item.status}`}
                </meter>
                <div aria-hidden="true" className="absolute inset-0">
                  <div
                    style={{ width: `${item.value}%` }}
                    className={cn(
                      "h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
                      isCritical ? "bg-danger-600" : isElevated ? "bg-warning-500" : "bg-primary-700",
                    )}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

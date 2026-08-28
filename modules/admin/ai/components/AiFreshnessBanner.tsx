"use client";

import { Clock, ShieldCheck, Sparkles } from "@/lib/icons";
import type { FreshnessState } from "@/lib/admin/ai/contracts";

type AiFreshnessBannerProps = {
  policyVersion?: string;
  activatedAt?: string;
  freshness: FreshnessState;
};

export function AiFreshnessBanner({
  policyVersion = "VERA-POLICY-027",
  activatedAt = "27 Aug 2026, 14:20 WIB",
  freshness,
}: AiFreshnessBannerProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary-100 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800 border border-primary-100">
          <Sparkles className="size-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-secondary-500">
              Kebijakan Aktif:
            </span>
            <span className="font-extrabold text-secondary-950 text-sm">{policyVersion}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold text-primary-700 border border-primary-100">
              <ShieldCheck className="size-3" />
               Snapshot terverifikasi
            </span>
          </div>
          <p className="text-xs text-secondary-500">Diterapkan {activatedAt}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-primary-50 pt-2 text-xs text-secondary-500 sm:border-0 sm:pt-0">
        <div className="flex items-center gap-1.5">
          <Clock className="size-3.5 text-secondary-400" />
          <span>Permintaan:</span>
          <span className="font-semibold text-secondary-700">{freshness.requests.label}</span>
        </div>
        <div className="hidden h-3 w-px bg-secondary-200 sm:block" />
        <div className="flex items-center gap-1.5">
          <span>Kuota:</span>
          <span className="font-semibold text-secondary-700">{freshness.quota.label}</span>
        </div>
        <div className="hidden h-3 w-px bg-secondary-200 sm:block" />
        <div className="flex items-center gap-1.5">
          <span>Biaya:</span>
          <span className="font-semibold text-secondary-700">{freshness.cost.label}</span>
        </div>
      </div>
    </div>
  );
}

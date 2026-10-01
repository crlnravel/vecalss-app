"use client";

import { Clock, ShieldCheck, Sparkles } from "@/lib/icons";
import type { FreshnessState } from "@/lib/admin/ai/contracts";

type AiFreshnessBannerProps = {
  policyVersion?: string | null;
  activatedAt?: string | null;
  freshness: FreshnessState;
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function formatAsOf(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "waktu tidak tersedia";
  return DATE_TIME_FORMATTER.format(date);
}

function stateLabel(state: FreshnessState["requests"]["state"] | FreshnessState["cost"]["state"]) {
  if (state === "live" || state === "fresh") return "Tersedia";
  if (state === "stale") return "Stale";
  return "Tidak tersedia";
}

export function AiFreshnessBanner({
  policyVersion,
  activatedAt,
  freshness,
}: AiFreshnessBannerProps) {
  const hasPolicySnapshot = Boolean(policyVersion || activatedAt);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-primary-100 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800 border border-primary-100">
          <Sparkles className="size-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-secondary-500">
              Kebijakan Aktif:
            </span>
            <span className="font-extrabold text-secondary-950 text-sm">{policyVersion ?? "Belum tersedia"}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary-100 bg-primary-50 px-2 py-0.5 text-[10px] font-bold text-primary-700">
              <ShieldCheck className="size-3" />
              {hasPolicySnapshot ? "Snapshot terdeteksi" : "Snapshot belum tersedia"}
            </span>
          </div>
          <p className="text-xs text-secondary-500">
            {activatedAt ? `Diterapkan ${activatedAt}` : "Waktu penerapan belum tersedia."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-primary-50 pt-2 text-xs text-secondary-500 sm:border-0 sm:pt-0">
        <div className="flex items-center gap-1.5">
          <Clock className="size-3.5 text-secondary-400" />
          <span>Permintaan:</span>
          <span className="font-semibold text-secondary-700">{stateLabel(freshness.requests.state)} · {freshness.requests.label} · {formatAsOf(freshness.requests.asOf)}</span>
        </div>
        <div className="hidden h-3 w-px bg-secondary-200 sm:block" />
        <div className="flex items-center gap-1.5">
          <span>Kuota:</span>
          <span className="font-semibold text-secondary-700">{stateLabel(freshness.quota.state)} · {freshness.quota.label} · {formatAsOf(freshness.quota.asOf)}</span>
        </div>
        <div className="hidden h-3 w-px bg-secondary-200 sm:block" />
        <div className="flex items-center gap-1.5">
          <span>Biaya:</span>
          <span className="font-semibold text-secondary-700">{stateLabel(freshness.cost.state)} · {freshness.cost.label} · {formatAsOf(freshness.cost.asOf)}</span>
        </div>
        <div className="hidden h-3 w-px bg-secondary-200 sm:block" />
        <div className="flex items-center gap-1.5">
          <span>Analitik:</span>
          <span className="font-semibold text-secondary-700">{stateLabel(freshness.analytics.state)} · {freshness.analytics.label} · {formatAsOf(freshness.analytics.asOf)}</span>
        </div>
      </div>
    </div>
  );
}

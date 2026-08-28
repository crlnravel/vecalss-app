"use client";

import { ArrowDown, ArrowUp, ShieldCheck } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { SemanticMetric } from "@/lib/admin/ai/contracts";

type AiMetricCardProps = {
  title: string;
  metric: SemanticMetric<number | string>;
  subCaption?: string;
  className?: string;
};

export function AiMetricCard({ title, metric, subCaption, className }: AiMetricCardProps) {
  if (metric.state === "suppressed") {
    return (
      <div
        className={cn(
          "flex flex-col rounded-2xl border border-primary-100 bg-white p-4 shadow-xs",
          className,
        )}
      >
        <span className="text-xs font-semibold text-secondary-600">{title}</span>
        <div className="mt-3 flex items-center gap-2 text-secondary-500">
          <ShieldCheck className="size-4.5 text-primary-700 shrink-0" />
          <span className="text-sm font-semibold text-secondary-700">Disembunyikan (Privasi)</span>
        </div>
        <p className="mt-2 text-xs text-secondary-500 leading-normal">
          {metric.message ?? "Kelompok belum memenuhi batas privasi minimum (k ≥ 5)."}
        </p>
      </div>
    );
  }

  if (metric.state === "unavailable") {
    return (
      <div
        className={cn(
          "flex flex-col rounded-2xl border border-primary-100 bg-white p-4 shadow-xs",
          className,
        )}
      >
        <span className="text-xs font-semibold text-secondary-600">{title}</span>
        <p className="mt-3 text-lg font-bold text-secondary-400">—</p>
        <p className="mt-1 text-xs text-secondary-500">Data belum tersedia untuk periode ini</p>
      </div>
    );
  }

  const displayVal =
    metric.formattedValue ??
    (typeof metric.value === "number" ? metric.value.toLocaleString("id-ID") : String(metric.value));

  const hasTrend = metric.trendDelta !== undefined && metric.trendDelta !== null;
  const isPositive = (metric.trendDelta ?? 0) >= 0;
  const isNeutral = (metric.trendDelta ?? 0) === 0;

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border border-primary-100 bg-white p-4 shadow-xs transition-all hover:border-primary-200",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-secondary-600">{title}</span>
        {metric.state === "partial" && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
            {Math.round(metric.coverage * 100)}% cakupan
          </span>
        )}
      </div>

      <div className="mt-2 flex-1">
        <p className="text-2xl font-extrabold tracking-tight text-secondary-950 lg:text-3xl">
          {displayVal}
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-primary-50 pt-3 text-xs">
        {hasTrend ? (
          <div
            className={cn(
              "flex items-center gap-1 font-bold",
              isNeutral
                ? "text-secondary-500"
                : isPositive
                ? "text-primary-700"
                : "text-red-600",
            )}
          >
            {!isNeutral && (
              isPositive ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
            )}
            <span>
              {isPositive && !isNeutral ? "+" : ""}
              {metric.trendDelta}
              {metric.trendUnit ?? "%"}
            </span>
          </div>
        ) : (
          <span className="text-secondary-400">Stabil</span>
        )}

        {subCaption && (
          <span className="text-xs font-medium text-secondary-500">{subCaption}</span>
        )}
      </div>
    </div>
  );
}

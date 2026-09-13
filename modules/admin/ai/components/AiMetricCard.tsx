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

type SuppressedMetric = Extract<SemanticMetric<number | string>, { state: "suppressed" }>;
type ActiveMetric = Extract<SemanticMetric<number | string>, { state: "available" | "partial" }>;

function SuppressedMetricCard({ className, metric, title }: Omit<AiMetricCardProps, "metric"> & { metric: SuppressedMetric }) {
  return (
    <div className={cn("flex flex-col rounded-2xl border border-primary-100 bg-white p-4 shadow-xs", className)}>
      <span className="text-xs font-semibold text-secondary-600">{title}</span>
      <div className="mt-3 flex items-center gap-2 text-secondary-500">
        <ShieldCheck className="size-4.5 shrink-0 text-primary-700" />
        <span className="text-sm font-semibold text-secondary-700">Disembunyikan (Privasi)</span>
      </div>
      <p className="mt-2 text-xs leading-normal text-secondary-500">{metric.message ?? "Kelompok belum memenuhi batas privasi minimum (k ≥ 5)."}</p>
    </div>
  );
}

function UnavailableMetricCard({ className, title }: AiMetricCardProps) {
  return (
    <div className={cn("flex flex-col rounded-2xl border border-primary-100 bg-white p-4 shadow-xs", className)}>
      <span className="text-xs font-semibold text-secondary-600">{title}</span>
      <p className="mt-3 text-lg font-bold text-secondary-400">—</p>
      <p className="mt-1 text-xs text-secondary-500">Data belum tersedia untuk periode ini</p>
    </div>
  );
}

function MetricCoverageBadge({ metric }: { metric: ActiveMetric }) {
  if (metric.state !== "partial") return null;

  return <span className="rounded-full border border-warning-200 bg-warning-50 px-2 py-0.5 text-ui-xs font-bold text-warning-700">{Math.round(metric.coverage * 100)}% cakupan</span>;
}

function MetricTrendValue({ delta, unit }: { delta: number | null | undefined; unit?: string }) {
  if (delta === undefined || delta === null) return <span className="text-secondary-400">Stabil</span>;
  const isPositive = delta >= 0;
  const isNeutral = delta === 0;
  return <div className={cn("flex items-center gap-1 font-bold", isNeutral ? "text-secondary-500" : isPositive ? "text-primary-700" : "text-danger-600")}>
    {!isNeutral ? (isPositive ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />) : null}
    <span>{isPositive && !isNeutral ? "+" : ""}{delta}{unit ?? "%"}</span>
  </div>;
}

function MetricTrend({ metric, subCaption }: { metric: ActiveMetric; subCaption?: string }) {
  return (
    <div className="mt-3 flex items-center justify-between border-t border-primary-50 pt-3 text-xs">
      <MetricTrendValue delta={metric.trendDelta} unit={metric.trendUnit} />
      {subCaption ? <span className="text-xs font-medium text-secondary-500">{subCaption}</span> : null}
    </div>
  );
}

function ActiveMetricCard({ className, metric, subCaption, title }: Omit<AiMetricCardProps, "metric"> & { metric: ActiveMetric }) {
  const displayVal = metric.formattedValue ?? (typeof metric.value === "number" ? metric.value.toLocaleString("id-ID") : String(metric.value));

  return (
    <div className={cn("flex flex-col rounded-2xl border border-primary-100 bg-white p-4 shadow-xs transition-all motion-reduce:transition-none hover:border-primary-200", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-secondary-600">{title}</span>
        <MetricCoverageBadge metric={metric} />
      </div>
      <div className="mt-2 flex-1">
        <p className="text-2xl font-extrabold tracking-tight text-secondary-950 lg:text-3xl">{displayVal}</p>
      </div>
      <MetricTrend metric={metric} subCaption={subCaption} />
    </div>
  );
}

export function AiMetricCard({ title, metric, subCaption, className }: AiMetricCardProps) {
  if (metric.state === "suppressed") {
    return <SuppressedMetricCard className={className} metric={metric} title={title} />;
  }

  if (metric.state === "unavailable") {
    return <UnavailableMetricCard className={className} metric={metric} title={title} />;
  }

  return <ActiveMetricCard className={className} metric={metric} subCaption={subCaption} title={title} />;
}

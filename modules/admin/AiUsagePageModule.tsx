"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  ReferencePageHeader,
  ReferenceSectionHeading,
  ReferenceStatusBadge,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, BarChart3, ChevronDown, Clock3, RefreshCw, ShieldCheck } from "@/lib/icons";
import type { SessionContext } from "@/lib/auth/types";
import {
  VERA_REPORT_FEATURES,
  VERA_REPORT_GATEWAYS,
  VERA_REPORT_MODELS,
  VERA_REPORT_UPSTREAMS,
  VERA_REPORT_STATUSES,
  type VeraAdminReportFailureDto,
  type VeraAdminUsageDto,
  type VeraAggregatePartition,
  type VeraComparisonRow,
  type VeraIncidentRow,
  type VeraReportFeature,
  type VeraReportGateway,
  type VeraReportModel,
  type VeraReportUpstream,
  type VeraReportStatus,
} from "@/lib/admin/ai-usage/types";
import { PortalShell } from "@/modules/portal/components/portal-shell";

type FilterValue = VeraReportFeature | "all";
type GatewayValue = VeraReportGateway | "unknown" | "all";
type ModelValue = VeraReportModel | "unknown" | "all";
type UpstreamValue = VeraReportUpstream | "unknown" | "all";
type StatusValue = VeraReportStatus | "all";
type ReportState = { kind: "idle" } | { kind: "loading" } | { kind: "error"; error: VeraAdminReportFailureDto | { error: string } } | { kind: "ready"; dto: VeraAdminUsageDto };

const REPORT_INCLUDES = "dailyTrend,byFeature,byModel,byStatus,incidents,comparison";
const featureLabels: Record<FilterValue, string> = {
  all: "Semua fitur",
  "vera.analysis": "Analysis",
  "vera.chat": "Chat",
  "vera.drill": "Drill",
  "vera.ptn": "PTN",
  "vera.review": "Review",
  "vera.route": "Route",
  "vera.summary": "Summary",
};
const statusLabels: Record<StatusValue, string> = {
  all: "Semua status",
  fallback: "Fallback",
  failed: "Failed",
  pending: "Pending",
  staged: "Staged",
  succeeded: "Sukses",
};
const gatewayLabels: Record<GatewayValue, string> = {
  all: "Semua gateway",
  openrouter: "OpenRouter",
  mock: "Mock gateway",
  unknown: "Gateway unknown",
};
const upstreamLabels: Record<UpstreamValue, string> = {
  all: "Semua upstream",
  decart: "Decart",
  mock: "Mock upstream",
  unknown: "Upstream unknown",
};
const modelLabels: Record<ModelValue, string> = {
  all: "Semua model",
  "z-ai/glm-5.2:free": "z-ai/glm-5.2:free",
  mock: "Mock model",
  unknown: "Model unknown",
};

const countFormatter = new Intl.NumberFormat("id-ID");
const numberFormatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

function formatNumber(value: number | null) {
  return value === null ? "—" : countFormatter.format(value);
}

function formatDecimal(value: number | null) {
  return value === null ? "—" : numberFormatter.format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "Belum tersedia";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function reportKey() {
  if (typeof window !== "undefined" && typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `report-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function partitionMessage<T>(partition: VeraAggregatePartition<T>) {
  if (partition.state === "suppressed") return "Data agregat disembunyikan karena ukuran kelompok minimum belum terpenuhi.";
  if (partition.state === "unavailable") return partition.reason === "not_requested"
    ? "Partisi ini belum diminta."
    : "Partisi ini belum tersedia untuk rentang tersebut.";
  return null;
}

function PartitionState<T>({ partition }: { partition: VeraAggregatePartition<T> }) {
  const message = partitionMessage(partition);
  return message ? (
    <ReferenceSurface className="flex items-start gap-3 px-4 py-4 text-sm leading-6 text-secondary-600" variant="inset">
      <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-primary-700" size={18} />
      <p>{message}</p>
    </ReferenceSurface>
  ) : null;
}

function FilterMenu<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T;
}) {
  const selected = options.find((option) => option.value === value)?.label ?? label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button className={REFERENCE_CONTROL_CLASS_NAMES.select} variant="reference" />}>
        <span className="truncate">{selected}</span>
        <ChevronDown aria-hidden="true" size={16} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup onValueChange={(next) => onChange(next as T)} value={value}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SummaryPanel({ partition }: { partition: VeraAggregatePartition }) {
  if (partition.state !== "ready") {
    return <PartitionState partition={partition} />;
  }
  const summary = partition.rows[0];
  if (!summary) return <p className="text-sm text-secondary-600">Belum ada request pada rentang ini.</p>;
  const metrics = [
    { label: "Requests", value: formatNumber(summary.requests) },
    { label: "Sukses terminal", value: formatNumber(summary.succeeded) },
    { label: "Success rate", value: summary.successRate === null ? "—" : `${(summary.successRate * 100).toFixed(1)}%` },
    { label: "Quota consumed", value: formatDecimal(summary.quotaUnits) },
    { label: "Pending / staged", value: `${formatNumber(summary.pending)} / ${formatNumber(summary.staged)}` },
    { label: "P95 latency", value: summary.p95LatencyMs === null ? "—" : `${formatNumber(summary.p95LatencyMs)} ms` },
  ];
  return (
    <ReferenceSurface className="grid gap-px overflow-hidden sm:grid-cols-2 lg:grid-cols-3" variant="inset">
      {metrics.map((metric) => (
        <div className="bg-white px-4 py-4" key={metric.label}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary-500">{metric.label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-secondary-900">{metric.value}</p>
        </div>
      ))}
    </ReferenceSurface>
  );
}

function AggregateTable({ partition, title }: { partition: VeraAggregatePartition; title: string }) {
  return (
    <ReferenceSurface as="section" className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-primary-100 px-5 py-4">
        <h2 className="text-base font-semibold text-secondary-900">{title}</h2>
        <ReferenceStatusBadge label="Agregat" size="xs" status="info" />
      </div>
      <PartitionState partition={partition} />
      {partition.state === "ready" && partition.rows.length > 0 ? (
        <Table className="hidden sm:table">
          <TableHeader>
            <TableRow className="bg-secondary-50/80 hover:bg-secondary-50/80">
              <TableHead>Label</TableHead>
              <TableHead>Requests</TableHead>
              <TableHead>Sukses</TableHead>
              <TableHead>Fallback</TableHead>
              <TableHead>Failed</TableHead>
              <TableHead>Active students</TableHead>
              <TableHead>Quota</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partition.rows.map((row, index) => (
              <TableRow key={`${row.label ?? row.date ?? "row"}-${index}`}>
                <TableCell className="font-medium text-secondary-900">{row.label ?? row.date ?? "Total"}</TableCell>
                <TableCell>{formatNumber(row.requests)}</TableCell>
                <TableCell>{formatNumber(row.succeeded)}</TableCell>
                <TableCell>{formatNumber(row.fallback)}</TableCell>
                <TableCell>{formatNumber(row.failed)}</TableCell>
                <TableCell>{formatNumber(row.activeStudents)}</TableCell>
                <TableCell>{formatDecimal(row.quotaUnits)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {partition.state === "ready" && partition.rows.length > 0 ? (
        <div className="grid gap-3 p-4 sm:hidden">
          {partition.rows.map((row, index) => (
            <article className="rounded-2xl border border-primary-100 bg-primary-50/40 p-4" key={`${row.label ?? row.date ?? "row"}-mobile-${index}`}>
              <p className="font-semibold text-secondary-900">{row.label ?? row.date ?? "Total"}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div><dt className="text-secondary-500">Requests</dt><dd className="font-semibold text-secondary-900">{formatNumber(row.requests)}</dd></div>
                <div><dt className="text-secondary-500">Sukses</dt><dd className="font-semibold text-secondary-900">{formatNumber(row.succeeded)}</dd></div>
                <div><dt className="text-secondary-500">Fallback</dt><dd className="font-semibold text-secondary-900">{formatNumber(row.fallback)}</dd></div>
                <div><dt className="text-secondary-500">Failed</dt><dd className="font-semibold text-secondary-900">{formatNumber(row.failed)}</dd></div>
                <div><dt className="text-secondary-500">Students</dt><dd className="font-semibold text-secondary-900">{formatNumber(row.activeStudents)}</dd></div>
                <div><dt className="text-secondary-500">Quota</dt><dd className="font-semibold text-secondary-900">{formatDecimal(row.quotaUnits)}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}
      {partition.state === "ready" && partition.rows.length === 0 ? <p className="px-5 py-5 text-sm text-secondary-600">Belum ada data pada rentang ini.</p> : null}
    </ReferenceSurface>
  );
}

function IncidentPanel({ partition }: { partition: VeraAggregatePartition<VeraIncidentRow> }) {
  return (
    <ReferenceSurface as="section" className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-primary-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-secondary-900">Incidents</h2>
          <p className="mt-1 text-sm text-secondary-600">Admission dan outcome dibaca sebagai agregat terpisah.</p>
        </div>
        <AlertCircle aria-hidden="true" className="text-primary-700" size={20} />
      </div>
      <PartitionState partition={partition} />
      {partition.state === "ready" ? (
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {partition.rows.map((incident) => (
            <div className="rounded-2xl border border-primary-100 bg-primary-50/55 px-4 py-3" key={incident.label}>
              <p className="text-sm font-semibold text-secondary-900">{incident.label.replaceAll("_", " ")}</p>
              <p className="mt-2 text-xl font-semibold text-primary-800">{formatNumber(incident.count)}</p>
              <p className="mt-1 text-xs text-secondary-600">Kelompok aman: {formatNumber(incident.activeStudents)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </ReferenceSurface>
  );
}

function ComparisonPanel({ partition }: { partition: VeraAggregatePartition<VeraComparisonRow> }) {
  return (
    <ReferenceSurface as="section" className="overflow-hidden">
      <div className="flex flex-col gap-1 border-b border-primary-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-secondary-900">Period comparison</h2>
          <p className="mt-1 text-sm text-secondary-600">Perbandingan terhadap rentang kalender lokal sebelumnya; hanya agregat.</p>
        </div>
        <ReferenceStatusBadge label="Tidak retroaktif" size="xs" status="neutral" />
      </div>
      <PartitionState partition={partition} />
      {partition.state === "ready" && partition.rows.length > 0 ? (
        <div className="grid gap-px bg-primary-100 sm:grid-cols-3">
          {[
            { label: "Requests", key: "requests" as const },
            { label: "Sukses terminal", key: "succeeded" as const },
            { label: "Quota units", key: "quotaUnits" as const },
          ].map((metric) => {
            const row = partition.rows[0]!;
            const delta = row.delta?.[metric.key] ?? null;
            return (
              <div className="bg-white px-5 py-4" key={metric.key}>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary-500">{metric.label}</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <p className="text-xl font-semibold text-secondary-900">{formatNumber(row.current[metric.key])}</p>
                  <span className="text-xs text-secondary-500">vs {formatNumber(row.previous[metric.key])}</span>
                </div>
                <p className="mt-1 text-xs text-secondary-600">Delta {formatNumber(delta)}</p>
              </div>
            );
          })}
        </div>
      ) : null}
    </ReferenceSurface>
  );
}

function AiUsagePageModule({ session }: { session: SessionContext }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [feature, setFeature] = useState<FilterValue>("all");
  const [gateway, setGateway] = useState<GatewayValue>("all");
  const [upstreamProvider, setUpstreamProvider] = useState<UpstreamValue>("all");
  const [model, setModel] = useState<ModelValue>("all");
  const [status, setStatus] = useState<StatusValue>("all");
  const [state, setState] = useState<ReportState>({ kind: "idle" });

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ include: REPORT_INCLUDES, timezone });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (feature !== "all") params.set("feature", feature);
    if (gateway !== "all") params.set("gateway", gateway);
    if (upstreamProvider !== "all") params.set("upstreamProvider", upstreamProvider);
    if (model !== "all") params.set("model", model);
    if (status !== "all") params.set("status", status);
    return params.toString();
  }, [feature, from, gateway, model, status, timezone, to, upstreamProvider]);

  const loadReport = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await fetch(`/api/admin/ai-usage?${queryString}`, {
        cache: "no-store",
        headers: { "Idempotency-Key": reportKey() },
      });
      const body = await response.json() as VeraAdminUsageDto | VeraAdminReportFailureDto | { error: string };
      if (!response.ok) {
        setState({ kind: "error", error: body as VeraAdminReportFailureDto | { error: string } });
        return;
      }
      const dto = body as VeraAdminUsageDto;
      setState({ kind: "ready", dto });
      setFrom((current) => current || dto.range.from);
      setTo((current) => current || dto.range.to);
      setTimezone(dto.range.timezone);
    } catch {
      setState({ kind: "error", error: { error: "report_unavailable" } });
    }
  }, [queryString]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReport();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadReport]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadReport();
  }

  const dto = state.kind === "ready" ? state.dto : null;
  const reportError = state.kind === "error" ? state.error : null;
  const errorCode = reportError && "code" in reportError ? reportError.code : reportError?.error ?? null;

  return (
    <PortalShell
      activeAdminSection="ai-usage"
      audience="admin"
      description="Aggregate-only telemetry for Vera AI operations, with privacy suppression and fixed report budgets."
      session={session}
      title="AI usage"
    >
      <div className="space-y-8">
        <ReferencePageHeader
          actions={
            <ReferenceSurface className="flex items-center gap-2 px-3.5 py-2.5 text-sm text-secondary-600" variant="inset">
              <BarChart3 aria-hidden="true" className="text-primary-700" size={20} />
              <span>Mock / disabled telemetry only</span>
            </ReferenceSurface>
          }
          description="Pantau volume, latency, quota, dan incident Vera tanpa membuka identitas siswa atau isi percakapan."
          title="AI usage"
        />

        <ReferenceSurface as="section" className="p-5 sm:p-6">
          <form className="grid gap-4 lg:grid-cols-4 xl:grid-cols-8" onSubmit={onSubmit}>
            <label className="grid gap-2 text-sm font-semibold text-secondary-800">Dari<input aria-label="Tanggal mulai" className={REFERENCE_CONTROL_CLASS_NAMES.input} onChange={(event) => setFrom(event.target.value)} type="date" value={from} /></label>
            <label className="grid gap-2 text-sm font-semibold text-secondary-800">Sampai<input aria-label="Tanggal akhir eksklusif" className={REFERENCE_CONTROL_CLASS_NAMES.input} onChange={(event) => setTo(event.target.value)} type="date" value={to} /></label>
            <label className="grid gap-2 text-sm font-semibold text-secondary-800">Zona IANA<Input aria-label="Zona waktu IANA" className={REFERENCE_CONTROL_CLASS_NAMES.input} onChange={(event) => setTimezone(event.target.value)} value={timezone} /></label>
            <FilterMenu label="Fitur" onChange={setFeature} options={["all", ...VERA_REPORT_FEATURES].map((value) => ({ label: featureLabels[value as FilterValue], value: value as FilterValue }))} value={feature} />
            <FilterMenu label="Status" onChange={setStatus} options={["all", ...VERA_REPORT_STATUSES].map((value) => ({ label: statusLabels[value as StatusValue], value: value as StatusValue }))} value={status} />
            <FilterMenu label="Gateway" onChange={setGateway} options={["all", ...VERA_REPORT_GATEWAYS, "unknown"].map((value) => ({ label: gatewayLabels[value as GatewayValue], value: value as GatewayValue }))} value={gateway} />
            <FilterMenu label="Upstream" onChange={setUpstreamProvider} options={["all", ...VERA_REPORT_UPSTREAMS, "unknown"].map((value) => ({ label: upstreamLabels[value as UpstreamValue], value: value as UpstreamValue }))} value={upstreamProvider} />
            <FilterMenu label="Model" onChange={setModel} options={["all", ...VERA_REPORT_MODELS, "unknown"].map((value) => ({ label: modelLabels[value as ModelValue], value: value as ModelValue }))} value={model} />
            <Button className="self-end" disabled={state.kind === "loading"} type="submit" variant="brand">
              {state.kind === "loading" ? <RefreshCw aria-hidden="true" className="animate-spin" size={16} /> : <RefreshCw aria-hidden="true" size={16} />}
              Muat laporan
            </Button>
          </form>
          <p className="mt-4 text-xs leading-5 text-secondary-500">Tanggal akhir bersifat eksklusif. Rentang maksimal 31 hari lokal dan dihitung aman terhadap DST.</p>
        </ReferenceSurface>

        {state.kind === "loading" ? (
          <ReferenceSurface as="section" aria-live="polite" className="animate-pulse p-5 sm:p-6">
            <div className="h-5 w-44 rounded bg-primary-100" />
            <div className="mt-5 grid gap-px overflow-hidden rounded-3xl bg-primary-100 sm:grid-cols-3">
              {["one", "two", "three", "four", "five", "six"].map((item) => <div className="h-24 bg-white" key={item} />)}
            </div>
          </ReferenceSurface>
        ) : null}

        {state.kind === "error" ? (
          <ReferenceSurface as="section" className="flex items-start gap-4 p-5 sm:p-6" role="alert" variant="inset">
            <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0 text-red-700" size={22} />
            <div>
              <h2 className="font-semibold text-secondary-900">Laporan belum dapat dimuat</h2>
              <p className="mt-1 text-sm leading-6 text-secondary-600">{errorCode === "report_budget_exhausted" || errorCode === "report_burst_limited" ? "Budget laporan sementara habis. Tunggu sebentar sebelum mencoba lagi." : "Periksa rentang dan zona waktu, lalu coba lagi. Infrastruktur report yang tidak tersedia akan gagal tertutup."}</p>
            </div>
          </ReferenceSurface>
        ) : null}

        {dto ? (
          <>
            <ReferenceSurface as="section" className="p-5 sm:p-6">
              <ReferenceSectionHeading
                action={<div className="flex items-center gap-2 text-xs text-secondary-500"><Clock3 aria-hidden="true" size={15} /> Data sampai {formatDateTime(dto.lastUpdatedAt)}</div>}
                description={`${dto.range.from} sampai ${dto.range.to} · ${dto.range.timezone}`}
                title="Summary"
              />
              <SummaryPanel partition={dto.summary} />
            </ReferenceSurface>

            <div className="grid gap-5 xl:grid-cols-2">
              <AggregateTable partition={dto.dailyTrend} title="Daily trend" />
              <AggregateTable partition={dto.byFeature} title="By feature" />
              <AggregateTable partition={dto.byModel} title="By model" />
              <AggregateTable partition={dto.byStatus} title="By status" />
            </div>

            <IncidentPanel partition={dto.incidents} />

            <ComparisonPanel partition={dto.comparison} />

            <ReferenceSurface as="section" className="p-5 sm:p-6">
              <h2 className="text-base font-semibold text-secondary-900">Policy & freshness</h2>
              <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-secondary-500">Policy aktif</p><p className="mt-1 font-semibold text-secondary-900">{dto.policySummary.active.bundleVersion}</p></div>
                <div><p className="text-secondary-500">Minimum cohort</p><p className="mt-1 font-semibold text-secondary-900">k = {dto.policySummary.active.allowlistedThresholds.minimumGroupSize}</p></div>
                <div><p className="text-secondary-500">Unit / request limit</p><p className="mt-1 font-semibold text-secondary-900">{dto.policySummary.active.allowlistedThresholds.unitLimit} / {dto.policySummary.active.allowlistedThresholds.requestLimit}</p></div>
                <div><p className="text-secondary-500">Freshness</p><div className="mt-1"><ReferenceStatusBadge label={dto.freshness.state === "fresh" ? "Fresh" : dto.freshness.state === "stale" ? "Stale" : "Unavailable"} size="xs" status={dto.freshness.state} tone={dto.freshness.state === "fresh" ? "success" : dto.freshness.state === "stale" ? "attention" : "danger"} /></div></div>
              </div>
              {dto.freshness.state !== "fresh" ? <p className="mt-4 text-sm leading-6 text-secondary-600">Freshness tidak mengubah agregat atau mengungkap detail yang disembunyikan.</p> : null}
            </ReferenceSurface>
          </>
        ) : null}
      </div>
    </PortalShell>
  );
}

export { AiUsagePageModule };

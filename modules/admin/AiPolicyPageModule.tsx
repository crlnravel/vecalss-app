"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  ReferencePageHeader,
  ReferenceStatusBadge,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AiPolicyBundleDto, AiPolicyImpactPreviewDto, AiPolicyMetadataDto, PolicySection } from "@/lib/admin/ai-policy/contracts";

type AiPolicyPageModuleProps = {
  metadata: AiPolicyMetadataDto;
};

type PendingPolicyConfirmation = {
  action: () => void | Promise<void>;
  description: string;
  title: string;
};

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatDate(value: string | null | undefined) {
  return value ? dateFormatter.format(new Date(value)) : "Belum tersedia";
}

function createRequestId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function sendCommand(path: string, body: Record<string, unknown>, method: "PATCH" | "POST" = "POST") {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(typeof errorPayload.message === "string" ? errorPayload.message : "Perintah kebijakan gagal.");
  }
  return response.json();
}

function resultBundle(payload: unknown): AiPolicyBundleDto | null {
  if (!payload || typeof payload !== "object" || !("result" in payload)) return null;
  const result = (payload as { result?: unknown }).result;
  return result && typeof result === "object" && "id" in result && "state" in result
    ? result as AiPolicyBundleDto
    : null;
}

function resultPreview(payload: unknown): AiPolicyImpactPreviewDto | null {
  if (!payload || typeof payload !== "object" || !("result" in payload)) return null;
  const result = (payload as { result?: unknown }).result;
  return result && typeof result === "object" && "effects" in result && "mode" in result
    ? result as AiPolicyImpactPreviewDto
    : null;
}

function AiPolicyMetadataSummary({ metadata }: { metadata: AiPolicyMetadataDto }) {
  return (
    <>
      <ReferenceSurface as="section" className="p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-secondary-500">Versi aktif</p>
            <p className="mt-2 text-lg font-bold text-secondary-950">{metadata.active?.bundleVersion ?? "Belum ada"}</p>
            <p className="mt-1 text-xs text-secondary-600">Berlaku {formatDate(metadata.active?.effectiveAt)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-secondary-500">Successor terjadwal</p>
            <p className="mt-2 text-lg font-bold text-secondary-950">{metadata.scheduled?.bundleVersion ?? "Tidak ada"}</p>
            <p className="mt-1 text-xs text-secondary-600">Batas DB {formatDate(metadata.scheduled?.effectiveAt)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-secondary-500">Approver terakhir</p>
            <p className="mt-2 text-lg font-bold text-secondary-950">{metadata.active?.lastApprover?.display ?? "Belum tersedia"}</p>
            <p className="mt-1 break-all text-xs text-secondary-600">Digest {metadata.active?.validationDigest ?? "Belum tersedia"}</p>
          </div>
        </div>
      </ReferenceSurface>

      {!metadata.canMutate ? (
        <ReferenceSurface as="section" className="p-5 text-sm leading-7 text-secondary-700" variant="inset">
          <p className="font-bold text-secondary-950">Akses metadata saja</p>
          <p className="mt-1">Akun ini dapat membaca active, scheduled, dan audit history. Capability mutation tidak tersedia; UI ini tidak menyamarkan batas server.</p>
        </ReferenceSurface>
      ) : null}
    </>
  );
}

function AiPolicyTypedControls({
  busy,
  canGovern,
  canPolicy,
  dailyLimit,
  dirtySectionLabel,
  dirtySections,
  draft,
  editDraft,
  markDirty,
  quotaConfig,
  reportConfig,
  retentionConfig,
  setDailyLimit,
  setQuotaConfig,
  setReportConfig,
  setRetentionConfig,
  setSettlementConfig,
  settlementConfig,
  updateModeConfig,
}: {
  busy: boolean;
  canGovern: boolean;
  canPolicy: boolean;
  dailyLimit: string;
  dirtySectionLabel: string;
  dirtySections: Set<PolicySection>;
  draft: AiPolicyBundleDto;
  editDraft: () => void;
  markDirty: (section: PolicySection) => void;
  quotaConfig: AiPolicyBundleDto["quotaConfig"];
  reportConfig: AiPolicyBundleDto["reportConfig"];
  retentionConfig: AiPolicyBundleDto["retentionConfig"];
  setDailyLimit: React.Dispatch<React.SetStateAction<string>>;
  setQuotaConfig: React.Dispatch<React.SetStateAction<AiPolicyBundleDto["quotaConfig"] | null>>;
  setReportConfig: React.Dispatch<React.SetStateAction<AiPolicyBundleDto["reportConfig"] | null>>;
  setRetentionConfig: React.Dispatch<React.SetStateAction<AiPolicyBundleDto["retentionConfig"] | null>>;
  setSettlementConfig: React.Dispatch<React.SetStateAction<AiPolicyBundleDto["settlementConfig"] | null>>;
  settlementConfig: AiPolicyBundleDto["settlementConfig"];
  updateModeConfig: (mode: string, field: "inputBound" | "hardOutputCap" | "reservationBound", value: number) => void;
}) {
  return (
    <div className="space-y-5" data-testid="typed-policy-controls">
      <ReferenceSurface className="grid gap-4 rounded-2xl p-4" variant="inset">
        <div>
          <p className="text-sm font-bold text-secondary-900">Pemetaan quota / plan</p>
          <p className="mt-1 text-xs leading-5 text-secondary-600">Limit ini adalah default server untuk plan yang telah dipetakan BillingAccount; limit StudentProfile legacy tidak dipakai.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-secondary-700">
            {["free", "trial", "starter", "pro"].map((plan) => <span className="rounded-full border border-primary-100 bg-white px-3 py-1" key={plan}>{plan}: server policy</span>)}
          </div>
        </div>
        <label className="grid gap-2 text-sm font-semibold text-secondary-800" htmlFor="policy-daily-limit">
          Unit quota harian
          <input className={REFERENCE_CONTROL_CLASS_NAMES.input} disabled={!canPolicy} id="policy-daily-limit" inputMode="numeric" max={50000} min={1000} onChange={(event) => { markDirty("quota"); setDailyLimit(event.target.value); setQuotaConfig((current) => current ? { ...current, defaultDailyLimit: Number(event.target.value) } : current); }} type="number" value={dailyLimit} />
        </label>
      </ReferenceSurface>

      <ReferenceSurface className="rounded-2xl p-4" variant="inset">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-secondary-900">Input / output / reservation per mode</p>
            <p className="mt-1 text-xs text-secondary-600">Batas tersertifikasi divalidasi oleh server dan tidak dapat mengubah jumlah percobaan provider.</p>
          </div>
          <span className="rounded-full bg-secondary-50 px-3 py-1 text-xs font-semibold text-secondary-700">maks. percobaan: {quotaConfig.maxProviderAttempts}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Object.entries(quotaConfig.modes).map(([mode, values]) => (
            <ReferenceSurface className="rounded-2xl p-3" key={mode} variant="inset">
              <p className="text-sm font-semibold text-secondary-900">{mode}</p>
              <div className="mt-2 grid gap-2">
                <label className="grid gap-1 text-xs text-secondary-600">Batas input<input aria-label={`${mode} batas input`} className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-9 min-h-9 rounded-xl px-3 py-2`} disabled={!canPolicy} min={1000} onChange={(event) => { const num = event.currentTarget.valueAsNumber; if (Number.isFinite(num)) updateModeConfig(mode, "inputBound", num); }} type="number" value={values.inputBound} /></label>
                <label className="grid gap-1 text-xs text-secondary-600">Batas output<input aria-label={`${mode} batas output`} className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-9 min-h-9 rounded-xl px-3 py-2`} disabled={!canPolicy} min={256} onChange={(event) => { const num = event.currentTarget.valueAsNumber; if (Number.isFinite(num)) updateModeConfig(mode, "hardOutputCap", num); }} type="number" value={values.hardOutputCap} /></label>
                <label className="grid gap-1 text-xs text-secondary-600">Batas reservation<input aria-label={`${mode} batas reservation`} className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-9 min-h-9 rounded-xl px-3 py-2`} disabled={!canPolicy} min={1256} onChange={(event) => { const num = event.currentTarget.valueAsNumber; if (Number.isFinite(num)) updateModeConfig(mode, "reservationBound", num); }} type="number" value={values.reservationBound} /></label>
              </div>
            </ReferenceSurface>
          ))}
        </div>
      </ReferenceSurface>

      <div className="grid gap-4 md:grid-cols-2">
        <ReferenceSurface className="rounded-2xl p-4" variant="inset">
          <p className="text-sm font-bold text-secondary-900">Settlement</p>
          <label className="mt-3 grid gap-2 text-sm text-secondary-700">Max pending age (minutes)<input className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-10 min-h-10 rounded-xl px-3 py-2`} disabled={!canGovern} min={30} max={360} onChange={(event) => { const num = event.currentTarget.valueAsNumber; if (Number.isFinite(num)) { markDirty("settlement"); setSettlementConfig((current) => current ? { ...current, maxPendingAgeMinutes: num } : current); } }} type="number" value={settlementConfig.maxPendingAgeMinutes} /></label>
        </ReferenceSurface>
        <ReferenceSurface className="rounded-2xl p-4" variant="inset">
          <p className="text-sm font-bold text-secondary-900">Report budget / burst</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-secondary-700">Unit / 24 jam<input className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-10 min-h-10 rounded-xl px-3 py-2`} disabled={!canPolicy} min={12} max={240} onChange={(event) => { const num = event.currentTarget.valueAsNumber; if (Number.isFinite(num)) { markDirty("report"); setReportConfig((current) => current ? { ...current, unitLimit: num } : current); } }} type="number" value={reportConfig.unitLimit} /></label>
            <label className="grid gap-2 text-sm text-secondary-700">Diterima / 10 menit<input className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-10 min-h-10 rounded-xl px-3 py-2`} disabled={!canPolicy} min={1} max={60} onChange={(event) => { const num = event.currentTarget.valueAsNumber; if (Number.isFinite(num)) { markDirty("report"); setReportConfig((current) => current ? { ...current, requestLimit: num } : current); } }} type="number" value={reportConfig.requestLimit} /></label>
            <label className="grid gap-2 text-sm text-secondary-700">Minimum cohort (immutable)<input className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-10 min-h-10 rounded-xl px-3 py-2`} disabled max={100} min={5} readOnly type="number" value={reportConfig.minimumGroupSize} /></label>
            <label className="grid gap-2 text-sm text-secondary-700">Max range days (immutable)<input className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-10 min-h-10 rounded-xl px-3 py-2`} disabled max={31} min={1} readOnly type="number" value={reportConfig.maxRangeDays} /></label>
          </div>
        </ReferenceSurface>
      </div>

      <ReferenceSurface className="rounded-2xl p-4" variant="inset">
        <p className="text-sm font-bold text-secondary-900">Forward evidence / content TTL</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ["stageTtlHours", "Stage TTL (hours)"],
            ["contextEvidenceTtlDays", "Context evidence (days)"],
            ["acceptedKeyTtlDays", "Accepted key (days)"],
            ["rejectedKeyTtlHours", "Rejected key (hours)"],
            ["tombstoneTtlDays", "Tombstone (days)"],
            ["admissionTelemetryTtlDays", "Admission telemetry (days)"],
            ["operationalMetadataTtlDays", "Operational metadata (days)"],
            ["activeArtifactEvidenceTtlDays", "Active artifact evidence (days)"],
          ] as const).map(([field, label]) => (
            <label className="grid gap-2 text-sm text-secondary-700" key={field}>{label}<input className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-10 min-h-10 rounded-xl px-3 py-2`} disabled={!canGovern} min={1} onChange={(event) => { markDirty("retention"); setRetentionConfig((current) => current ? { ...current, [field]: Number(event.target.value) } : current); }} type="number" value={retentionConfig[field] ?? ""} /></label>
          ))}
        </div>
      </ReferenceSurface>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-secondary-500">Section berubah: {dirtySectionLabel}</p>
        <Button className="self-end" disabled={busy || draft.state !== "draft" || (!canPolicy && !canGovern) || dirtySections.size === 0} onClick={() => void editDraft()} type="button" variant="reference">Simpan section policy</Button>
      </div>
    </div>
  );
}

function AiPolicyAuditHistory({
  busy,
  canPolicy,
  history,
  onRefresh,
  rollbackBundle,
}: {
  busy: boolean;
  canPolicy: boolean;
  history: AiPolicyMetadataDto["history"];
  onRefresh: () => void;
  rollbackBundle: (bundleId: string) => void;
}) {
  return (
    <ReferenceSurface as="section" className="p-5 sm:p-6 md:p-7">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-[-0.03em] text-secondary-950">Version history</h2>
          <p className="mt-1 text-sm text-secondary-600">Audit content-free; setiap transisi menyimpan actor, digest, alasan, dan state.</p>
        </div>
        <Button disabled={busy} onClick={onRefresh} type="button" variant="reference">Refresh metadata</Button>
      </div>
      <div className="mt-5 hidden overflow-hidden sm:block">
        <Table className="table-fixed border-collapse text-left text-sm">
          <TableHeader className="border-b border-primary-100 text-xs uppercase tracking-[0.12em] text-secondary-500">
            <TableRow className="border-b-0 hover:bg-transparent">
              <TableHead className="px-3 py-3 font-bold">Version</TableHead>
              <TableHead className="px-3 py-3 font-bold">State</TableHead>
              <TableHead className="px-3 py-3 font-bold">Effective</TableHead>
              <TableHead className="px-3 py-3 font-bold">Reason</TableHead>
              <TableHead className="px-3 py-3 font-bold">Last action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.length ? history.map((item) => (
              <TableRow className="border-b border-primary-50 last:border-0" key={`${item.bundleVersion}-${item.validationDigest}`}>
                <TableCell className="px-3 py-4 font-semibold text-secondary-900">{item.bundleVersion}</TableCell>
                <TableCell className="px-3 py-4 text-secondary-700">{item.state}</TableCell>
                <TableCell className="px-3 py-4 text-secondary-700">{formatDate(item.effectiveAt)}</TableCell>
                <TableCell className="max-w-xs whitespace-normal px-3 py-4 text-secondary-600">{item.reason ?? "—"}</TableCell>
                <TableCell className="px-3 py-4 text-secondary-700"><span>{item.lastAction ?? "—"}</span>{item.state !== "active" && item.state !== "scheduled" ? null : <Button className="ml-3 h-8 px-2 text-xs" disabled={busy || !canPolicy} onClick={() => void rollbackBundle(item.id)} type="button" variant="ghost">Rollback</Button>}</TableCell>
              </TableRow>
            )) : <TableRow className="hover:bg-transparent"><TableCell className="px-3 py-8 text-secondary-600" colSpan={5}>Belum ada bundle yang tersimpan.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <div className="mt-5 grid gap-3 sm:hidden">
        {history.length ? history.map((item) => (
          <article className="rounded-2xl border border-primary-100 bg-primary-50/40 p-4" key={`${item.bundleVersion}-${item.validationDigest}-mobile`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="break-all text-sm font-semibold text-secondary-900">{item.bundleVersion}</p>
                <p className="mt-1 text-xs text-secondary-600">{item.state} · {formatDate(item.effectiveAt)}</p>
              </div>
              {item.state !== "active" && item.state !== "scheduled" ? null : <Button className="h-8 px-2 text-xs" disabled={busy || !canPolicy} onClick={() => void rollbackBundle(item.id)} type="button" variant="ghost">Rollback</Button>}
            </div>
            <dl className="mt-3 grid gap-2 text-xs">
              <div><dt className="text-secondary-500">Alasan</dt><dd className="mt-1 break-words text-secondary-700">{item.reason ?? "—"}</dd></div>
              <div><dt className="text-secondary-500">Aksi terakhir</dt><dd className="mt-1 break-words text-secondary-700">{item.lastAction ?? "—"}</dd></div>
            </dl>
          </article>
        )) : <p className="rounded-2xl bg-secondary-50 px-4 py-6 text-sm text-secondary-600">Belum ada bundle yang tersimpan.</p>}
      </div>
    </ReferenceSurface>
  );
}

function useAiPolicyPageState({ metadata: initialMetadata }: AiPolicyPageModuleProps) {
  const [metadata, setMetadata] = useState(initialMetadata);
  const [draft, setDraft] = useState<AiPolicyBundleDto | null>(null);
  const [dailyLimit, setDailyLimit] = useState("");
  const [quotaConfig, setQuotaConfig] = useState<AiPolicyBundleDto["quotaConfig"] | null>(null);
  const [settlementConfig, setSettlementConfig] = useState<AiPolicyBundleDto["settlementConfig"] | null>(null);
  const [reportConfig, setReportConfig] = useState<AiPolicyBundleDto["reportConfig"] | null>(null);
  const [retentionConfig, setRetentionConfig] = useState<AiPolicyBundleDto["retentionConfig"] | null>(null);
  const [preview, setPreview] = useState<AiPolicyImpactPreviewDto | null>(null);
  const [previewFrom, setPreviewFrom] = useState("");
  const [previewTo, setPreviewTo] = useState("");
  const [previewTimezone, setPreviewTimezone] = useState("Asia/Jakarta");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [reason, setReason] = useState("");
  const [targetReference, setTargetReference] = useState("");
  const [requestedUpperBound, setRequestedUpperBound] = useState("");
  const [dirtySections, setDirtySections] = useState<Set<PolicySection>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canGovern = metadata.capabilities.includes("canManageAiGovernance");
  const canPolicy = metadata.capabilities.includes("canManageAiPolicy");
  const capabilitySummary = useMemo(() => metadata.capabilities.length
    ? metadata.capabilities.join(" · ")
    : "read-only metadata", [metadata.capabilities]);

  function markDirty(section: PolicySection) {
    setDirtySections((current) => {
      const next = new Set(current);
      next.add(section);
      return next;
    });
  }

  function updateModeConfig(mode: string, field: "inputBound" | "hardOutputCap" | "reservationBound", value: number) {
    markDirty("quota");
    setQuotaConfig((current) => {
      if (!current || !current.modes[mode]) return current;
      return { ...current, modes: { ...current.modes, [mode]: { ...current.modes[mode], [field]: value } } };
    });
  }

  function applyBundlePayload(payload: unknown) {
    const bundle = resultBundle(payload);
    if (bundle) {
      setDraft(bundle);
      setDailyLimit(String(bundle.quotaConfig.defaultDailyLimit));
      setQuotaConfig(bundle.quotaConfig);
      setSettlementConfig(bundle.settlementConfig);
      setReportConfig(bundle.reportConfig);
      setRetentionConfig(bundle.retentionConfig);
      setDirtySections(new Set());
      setEffectiveAt(bundle.effectiveAt.slice(0, 16));
    }
    const impact = resultPreview(payload);
    if (impact) setPreview(impact);
    return bundle;
  }

  const dirtySectionLabel = dirtySections.size ? [...dirtySections].join(", ") : "none";

  async function refresh() {
    const response = await fetch("/api/admin/ai-policy", { cache: "no-store" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message ?? "Metadata kebijakan tidak tersedia.");
    }
    const payload = await response.json();
    setMetadata(payload.metadata);
  }

  async function createDraft() {
    setBusy(true);
    setMessage(null);
    try {
      const payload = await sendCommand("/api/admin/ai-policy/drafts", {
        clientRequestId: createRequestId("draft"),
        reason: reason.trim(),
      });
      applyBundlePayload(payload);
      setReason("");
      setMessage("Draft lengkap dibuat. Lanjutkan dengan edit section, validasi, preview, lalu minta approval operator kedua.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draft tidak dapat dibuat.");
    } finally {
      setBusy(false);
    }
  }

  async function editDraft() {
    if (!draft) return;
    const patch: Partial<Record<`${PolicySection}Config`, unknown>> = {};
    if (dirtySections.has("quota")) {
      const nextLimit = Number(dailyLimit);
      if (!Number.isSafeInteger(nextLimit)) {
        setMessage("Batas quota harian harus berupa bilangan bulat.");
        return;
      }
      if (!quotaConfig) {
        setMessage("Snapshot quota policy belum lengkap.");
        return;
      }
      patch.quotaConfig = { ...quotaConfig, defaultDailyLimit: nextLimit };
    }
    if (dirtySections.has("settlement") && settlementConfig) patch.settlementConfig = settlementConfig;
    if (dirtySections.has("report") && reportConfig) patch.reportConfig = reportConfig;
    if (dirtySections.has("retention") && retentionConfig) patch.retentionConfig = retentionConfig;
    if (!Object.keys(patch).length) {
      setMessage("Pilih perubahan pada section yang menjadi kewenangan akun ini.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const payload = await sendCommand(`/api/admin/ai-policy/drafts/${draft.id}`, {
        clientRequestId: createRequestId("edit"),
        expectedRevision: draft.revision,
        reason: reason.trim(),
        patch,
      }, "PATCH");
      applyBundlePayload(payload);
      setMessage("Perubahan section tersimpan ke draft.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Penyimpanan section draft gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function validateDraft() {
    if (!draft) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload = await sendCommand(`/api/admin/ai-policy/drafts/${draft.id}/validate`, {
        clientRequestId: createRequestId("validate"),
        expectedRevision: draft.revision,
      });
      applyBundlePayload(payload);
      setMessage("Draft tervalidasi. Siap untuk preview dampak dan approval operator kedua.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Validasi draft gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function previewDraft(scope: "categorical" | "aggregate") {
    if (!draft) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload = await sendCommand(`/api/admin/ai-policy/drafts/${draft.id}/preview`, {
        clientRequestId: createRequestId("preview"),
        expectedRevision: draft.revision,
        validationDigest: draft.validationDigest,
        mode: scope,
        range: scope === "aggregate" && previewFrom && previewTo ? {
          from: new Date(`${previewFrom}T00:00:00.000Z`).toISOString(),
          to: new Date(`${previewTo}T00:00:00.000Z`).toISOString(),
          timezone: previewTimezone,
        } : undefined,
      });
      applyBundlePayload(payload);
      setMessage(`Preview ${scope} selesai dibuat.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pembuatan preview dampak gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function approveDraft() {
    if (!draft) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload = await sendCommand(`/api/admin/ai-policy/drafts/${draft.id}/approve`, {
        clientRequestId: createRequestId("approve"),
        expectedRevision: draft.revision,
        validationDigest: draft.validationDigest,
        reason: reason.trim(),
      });
      applyBundlePayload(payload);
      setMessage("Draft disetujui. Siap dijadwalkan dengan timestamp UTC yang valid.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Persetujuan draft gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function scheduleDraft() {
    if (!draft || !effectiveAt) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload = await sendCommand(`/api/admin/ai-policy/drafts/${draft.id}/schedule`, {
        clientRequestId: createRequestId("schedule"),
        expectedRevision: draft.revision,
        validationDigest: draft.validationDigest,
        effectiveAt: new Date(effectiveAt).toISOString(),
        reason: reason.trim(),
      });
      applyBundlePayload(payload);
      setMessage("Draft berhasil dijadwalkan.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Penjadwalan draft gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function activateDraft() {
    if (!draft) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload = await sendCommand(`/api/admin/ai-policy/drafts/${draft.id}/activate`, {
        clientRequestId: createRequestId("activate"),
        expectedRevision: draft.revision,
        reason: reason.trim(),
      });
      const bundle = applyBundlePayload(payload);
      setMessage(bundle ? "Policy yang jatuh tempo berhasil diaktifkan." : "Tidak ada policy jatuh tempo yang diaktifkan.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Aktivasi policy jatuh tempo gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function rollbackBundle(targetBundleId: string) {
    setBusy(true);
    setMessage(null);
    try {
      const payload = await sendCommand(`/api/admin/ai-policy/bundles/${targetBundleId}/rollback`, {
        clientRequestId: createRequestId("rollback"),
        reason: reason.trim(),
      });
      applyBundlePayload(payload);
      setMessage("Draft rollback dibuat sebagai snapshot baru; histori lama tetap immutable.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rollback gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function requestRetentionExtension() {
    setBusy(true);
    setMessage(null);
    try {
      await sendCommand("/api/admin/ai-policy/retention-extension-requests", {
        clientRequestId: createRequestId("retention"),
        targetReference: targetReference.trim(),
        requestedUpperBound: requestedUpperBound.trim(),
        reason: reason.trim(),
      });
      setTargetReference("");
      setRequestedUpperBound("");
      setReason("");
      setMessage("Handoff retention diterima sebagai pending. Deadline dan lifecycle belum berubah; T11 tetap menjadi pemilik commit.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Handoff retention tidak dapat dibuat.");
    } finally {
      setBusy(false);
    }
  }

  return {
    activateDraft,
    approveDraft,
    busy,
    canGovern,
    canPolicy,
    capabilitySummary,
    createDraft,
    dailyLimit,
    dirtySectionLabel,
    dirtySections,
    draft,
    editDraft,
    effectiveAt,
    markDirty,
    message,
    metadata,
    preview,
    previewDraft,
    previewFrom,
    previewTimezone,
    previewTo,
    quotaConfig,
    reason,
    refresh,
    reportConfig,
    requestRetentionExtension,
    requestedUpperBound,
    retentionConfig,
    rollbackBundle,
    scheduleDraft,
    setDailyLimit,
    setDirtySections,
    setEffectiveAt,
    setMessage,
    setPreviewFrom,
    setPreviewTimezone,
    setPreviewTo,
    setQuotaConfig,
    setReason,
    setReportConfig,
    setRequestedUpperBound,
    setRetentionConfig,
    setSettlementConfig,
    setTargetReference,
    settlementConfig,
    targetReference,
    updateModeConfig,
    validateDraft,
  };
}

function AiPolicyPageModule(props: AiPolicyPageModuleProps) {
  const {
    activateDraft,
    approveDraft,
    busy,
    canGovern,
    canPolicy,
    capabilitySummary,
    createDraft,
    dailyLimit,
    dirtySectionLabel,
    dirtySections,
    draft,
    editDraft,
    effectiveAt,
    markDirty,
    message,
    metadata,
    preview,
    previewDraft,
    previewFrom,
    previewTimezone,
    previewTo,
    quotaConfig,
    reason,
    refresh,
    reportConfig,
    requestRetentionExtension,
    requestedUpperBound,
    retentionConfig,
    rollbackBundle,
    scheduleDraft,
    setDailyLimit,
    setEffectiveAt,
    setMessage,
    setPreviewFrom,
    setPreviewTimezone,
    setPreviewTo,
    setQuotaConfig,
    setReason,
    setReportConfig,
    setRequestedUpperBound,
    setRetentionConfig,
    setSettlementConfig,
    setTargetReference,
    settlementConfig,
    targetReference,
    updateModeConfig,
    validateDraft,
  } = useAiPolicyPageState(props);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingPolicyConfirmation | null>(null);

  function requestConfirmation(title: string, description: string, action: () => void | Promise<void>) {
    setPendingConfirmation({ action, description, title });
  }

  function confirmPendingAction() {
    const confirmation = pendingConfirmation;
    setPendingConfirmation(null);
    if (confirmation) void confirmation.action();
  }

  function requestRollback(bundleId: string) {
    requestConfirmation(
      "Konfirmasi rollback policy",
      `Rollback akan membuat snapshot policy baru dari ${bundleId}. Histori lama tetap immutable dan perubahan hanya berlaku setelah server menyelesaikan command dengan audit context.`,
      () => rollbackBundle(bundleId),
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setPendingConfirmation(null);
        }}
        open={Boolean(pendingConfirmation)}
      >
        <AlertDialogContent data-testid="policy-action-confirmation" variant="warning">
          <AlertDialogHeader>
            <AlertDialogMedia variant="warning" />
            <AlertDialogTitle>{pendingConfirmation?.title ?? "Konfirmasi perubahan policy"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConfirmation?.description ?? "Perubahan ini belum dijalankan."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={confirmPendingAction} variant="brand">
              Konfirmasi dan jalankan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReferencePageHeader
        actions={
          <div className="flex shrink-0 flex-wrap gap-2">
            <ReferenceStatusBadge label="Provider gate: open_blocked" size="sm" status="blocked" />
            <ReferenceStatusBadge label={capabilitySummary} size="sm" status={metadata.canMutate ? "active" : "neutral"} />
          </div>
        }
        description="Kelola snapshot operasional yang berlaku untuk admission, report reservation, settlement, dan bukti content ke depan. Perubahan tidak menulis ulang histori."
        title="Control plane policy Vera AI"
      />

      <AiPolicyMetadataSummary metadata={metadata} />

      <section className="grid gap-5 md:grid-cols-2">
        <ReferenceSurface as="section" className="p-5 sm:p-6">
          <h2 className="text-xl font-extrabold tracking-[-0.03em] text-secondary-950">Ruang lingkup policy yang dapat diedit</h2>
          <p className="mt-2 text-sm leading-6 text-secondary-600">Form perubahan section tersusun di backend dengan guardrail tetap: quota 1.000–50.000, settlement 30 menit–6 jam, report k≤5 dan maksimal 31 hari, serta provider attempts tepat 2.</p>
          <div className="mt-5 grid gap-3 text-sm text-secondary-700 sm:grid-cols-2">
            <ReferenceSurface className="rounded-2xl p-4" variant="inset"><span className="font-bold text-secondary-950">Policy</span><br />Quota, mode, report budget<br /><span className="text-xs text-secondary-500">{canPolicy ? "Dapat mengedit section" : "Tidak diberikan"}</span></ReferenceSurface>
            <ReferenceSurface className="rounded-2xl p-4" variant="inset"><span className="font-bold text-secondary-950">Governance</span><br />Settlement, evidence TTL<br /><span className="text-xs text-secondary-500">{canGovern ? "Dapat mengedit section" : "Tidak diberikan"}</span></ReferenceSurface>
          </div>
          {metadata.canMutate ? (
            <div className="mt-6 border-t border-primary-100 pt-5">
              <label className="block text-sm font-bold text-secondary-900" htmlFor="policy-reason">Alasan perubahan</label>
              <textarea
                className={`${REFERENCE_CONTROL_CLASS_NAMES.input} mt-2 min-h-24 resize-y rounded-2xl`}
                id="policy-reason"
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Contoh: menyelaraskan batas report burst untuk periode ujian."
                value={reason}
              />
              <Button
                className="mt-3"
                disabled={busy || reason.trim().length === 0}
                onClick={() => requestConfirmation(
                  "Konfirmasi pembuatan draft policy",
                  `Draft baru akan dibuat dengan alasan: ${reason.trim()}. Draft belum aktif dan tidak mengubah akses sampai lifecycle berikutnya selesai.`,
                  createDraft,
                )}
                type="button"
                variant="brand"
              >
                Buat complete draft
              </Button>
            </div>
          ) : null}
          {draft ? (
            <ReferenceSurface className="mt-6 space-y-4 p-4" data-testid="policy-lifecycle-controls" variant="inset">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-secondary-500">Draft terpilih</p>
                  <p className="mt-1 break-all text-sm font-semibold text-secondary-900">{draft.bundleVersion} · {draft.state} · rev {draft.revision}</p>
                </div>
                <ReferenceStatusBadge label="providerGateState=open_blocked" size="xs" status="blocked" />
              </div>
              {quotaConfig && settlementConfig && reportConfig && retentionConfig ? (
                <AiPolicyTypedControls
                  busy={busy}
                  canGovern={canGovern}
                  canPolicy={canPolicy}
                  dailyLimit={dailyLimit}
                  dirtySectionLabel={dirtySectionLabel}
                  dirtySections={dirtySections}
                  draft={draft}
                  editDraft={editDraft}
                  markDirty={markDirty}
                  quotaConfig={quotaConfig}
                  reportConfig={reportConfig}
                  retentionConfig={retentionConfig}
                  setDailyLimit={setDailyLimit}
                  setQuotaConfig={setQuotaConfig}
                  setReportConfig={setReportConfig}
                  setRetentionConfig={setRetentionConfig}
                  setSettlementConfig={setSettlementConfig}
                  settlementConfig={settlementConfig}
                  updateModeConfig={updateModeConfig}
                />
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || draft.state !== "draft"}
                  onClick={() => requestConfirmation(
                    "Konfirmasi validasi draft",
                    "Server akan memvalidasi draft dan dapat mengubah status lifecycle-nya. Tidak ada policy aktif yang ditulis sebelum approval dan aktivasi terpisah.",
                    validateDraft,
                  )}
                  type="button"
                  variant="brand"
                >Validasi draft</Button>
                <Button
                  disabled={busy || draft.state !== "pending_approval"}
                  onClick={() => requestConfirmation(
                    "Konfirmasi preview dampak",
                    "Preview membaca dampak future-only untuk admission, report reservation, dan content evidence. Preview tidak mengubah histori, tetapi dapat membuat reservation audit.",
                    () => previewDraft("categorical"),
                  )}
                  type="button"
                  variant="reference"
                >Preview dampak</Button>
                <Button
                  disabled={busy || draft.state !== "pending_approval"}
                  onClick={() => requestConfirmation(
                    "Konfirmasi approval policy",
                    `Approval operator kedua akan menyetujui digest ${draft.validationDigest}. Perubahan belum aktif sampai dijadwalkan dan diaktifkan.`,
                    approveDraft,
                  )}
                  type="button"
                  variant="reference"
                >Approve (operator kedua)</Button>
              </div>
              {draft.state === "pending_approval" ? (
                <ReferenceSurface className="grid gap-3 rounded-2xl p-4" variant="inset">
                  <div className="grid gap-2">
                    <p className="text-sm font-semibold text-secondary-800">Rentang preview agregat</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input aria-label="Preview range from" className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-10 min-h-10 rounded-xl px-3 py-2`} onChange={(event) => setPreviewFrom(event.target.value)} placeholder="2026-08-01" type="date" value={previewFrom} />
                      <input aria-label="Preview range to" className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-10 min-h-10 rounded-xl px-3 py-2`} onChange={(event) => setPreviewTo(event.target.value)} placeholder="2026-08-08" type="date" value={previewTo} />
                    </div>
                    <input aria-label="Preview IANA timezone" className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-10 min-h-10 rounded-xl px-3 py-2`} onChange={(event) => setPreviewTimezone(event.target.value)} value={previewTimezone} />
                    <Button
                      disabled={busy || !previewFrom || !previewTo}
                      onClick={() => requestConfirmation(
                        "Konfirmasi preview agregat",
                        `Preview aggregate akan membaca rentang ${previewFrom} sampai ${previewTo} (${previewTimezone}) dan mencatat reservation audit tanpa mengubah policy aktif.`,
                        () => previewDraft("aggregate"),
                      )}
                      type="button"
                      variant="reference"
                    >Jalankan preview agregat</Button>
                  </div>
                  <div className="text-xs leading-5 text-secondary-600">
                    Preview memerlukan rentang kalender lokal half-open, maksimum 31 hari. Cost penuh tetap dicatat walau hasil suppressed atau unavailable.
                  </div>
                </ReferenceSurface>
              ) : null}
              {draft.state === "pending_approval" || draft.state === "scheduled" ? (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <label className="grid gap-2 text-sm font-semibold text-secondary-800" htmlFor="policy-effective-at">
                    Waktu berlaku (lokal browser → UTC)
                    <input className={REFERENCE_CONTROL_CLASS_NAMES.input} id="policy-effective-at" onChange={(event) => setEffectiveAt(event.target.value)} type="datetime-local" value={effectiveAt} />
                  </label>
                  <div className="flex items-end gap-2">
                    <Button
                      disabled={busy || draft.state !== "pending_approval" || !effectiveAt}
                      onClick={() => requestConfirmation(
                        "Konfirmasi jadwal policy",
                        `Policy ini akan mulai memengaruhi admission, report reservation, dan content evidence pada ${effectiveAt}. Waktu dikirim ke server sebagai UTC dan perubahan bersifat future-only.`,
                        scheduleDraft,
                      )}
                      type="button"
                      variant="brand"
                    >Jadwalkan</Button>
                    <Button
                      disabled={busy || draft.state !== "scheduled"}
                      onClick={() => requestConfirmation(
                        "Konfirmasi aktivasi policy",
                        "Aktivasi akan mengganti policy aktif yang jatuh tempo. Server akan menyimpan audit actor, digest, alasan, dan hasil command.",
                        activateDraft,
                      )}
                      type="button"
                      variant="reference"
                    >Aktifkan yang jatuh tempo</Button>
                  </div>
                </div>
              ) : null}
              {preview ? (
                <ReferenceSurface className="p-4 text-sm text-secondary-700" role="status" variant="inset">
                  <p className="font-semibold text-secondary-900">Status preview: {preview.state}</p>
                  <p className="mt-1">Admission {preview.effects.futureAdmissions.state}; report {preview.effects.futureReportReservations.state}; content {preview.effects.futureContentEvidence.state}.</p>
                </ReferenceSurface>
              ) : null}
            </ReferenceSurface>
          ) : null}
        </ReferenceSurface>

        <ReferenceSurface as="section" className="p-5 sm:p-6">
          <h2 className="text-xl font-extrabold tracking-[-0.03em] text-secondary-950">Retention handoff</h2>
          <p className="mt-2 text-sm leading-6 text-secondary-600">Permintaan extension hanya dicatat sebagai pending. Tidak ada deadline, lifecycle, purge claim, atau key action yang berubah di Sprint 4.</p>
          {canGovern ? (
            <div className="mt-5 space-y-3">
              <label className="block text-sm font-bold text-secondary-900" htmlFor="retention-target">Referensi target</label>
              <input className={REFERENCE_CONTROL_CLASS_NAMES.input} id="retention-target" maxLength={160} onChange={(event) => setTargetReference(event.target.value)} placeholder="ID/content-free reference" value={targetReference} />
              <label className="block text-sm font-bold text-secondary-900" htmlFor="retention-bound">Batas waktu yang diminta (UTC)</label>
              <input className={REFERENCE_CONTROL_CLASS_NAMES.input} id="retention-bound" onChange={(event) => setRequestedUpperBound(event.target.value)} placeholder="2026-12-31T00:00:00.000Z" value={requestedUpperBound} />
              <Button
                disabled={busy || !targetReference.trim() || !requestedUpperBound.trim() || !reason.trim()}
                onClick={() => requestConfirmation(
                  "Konfirmasi pending retention handoff",
                  `Handoff untuk ${targetReference.trim()} akan dicatat sebagai pending sampai ${requestedUpperBound.trim()}. Deadline, lifecycle, purge claim, dan key action tidak berubah dari command ini.`,
                  requestRetentionExtension,
                )}
                type="button"
                variant="reference"
              >Kirim pending handoff</Button>
            </div>
          ) : <ReferenceSurface className="mt-5 p-4 text-sm text-secondary-600" variant="inset">Governance capability diperlukan untuk membuat handoff. Tidak ada tombol pengganti atau bypass.</ReferenceSurface>}
        </ReferenceSurface>
      </section>

      {message ? <ReferenceSurface aria-live="polite" className="px-4 py-3 text-sm leading-6 text-secondary-700" role="status" variant="inset">{message}</ReferenceSurface> : null}

      <AiPolicyAuditHistory
        busy={busy}
        canPolicy={canPolicy}
        history={metadata.history}
        onRefresh={() => void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Metadata tidak tersedia."))}
        rollbackBundle={requestRollback}
      />

      <p className="text-sm text-secondary-600">Butuh konteks operasional lain? Kembali ke <Link className="font-bold text-primary-800 underline decoration-primary-200 underline-offset-4" href="/admin">dashboard admin</Link>.</p>
    </div>
  );
}

export { AiPolicyPageModule };

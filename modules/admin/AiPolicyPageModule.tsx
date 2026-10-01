"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  ReferencePageHeader,
  ReferenceStatusBadge,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_CONTROL_CLASS_NAMES, REFERENCE_FIELD_LABEL_CLASS_NAME } from "@/components/dashboard/reference-dashboard-tokens";
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
import { showToast } from "@/components/ui/toast";
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
import { FieldError, FieldRequiredMark } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AiPolicyBundleDto, AiPolicyImpactPreviewDto, AiPolicyMetadataDto, PolicySection } from "@/lib/admin/ai-policy/contracts";
import {
  formatAiCapabilityLabel,
  formatAiFeatureLabel,
  formatAiImpactState,
  formatAiPolicyAction,
  formatAiPolicySection,
  formatAiPolicyState,
  formatAiPreviewState,
  formatAiProviderGateState,
} from "@/modules/admin/ai/components/AiDisplayLabels";

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

const AI_PLAN_LABELS: Record<string, string> = {
  free: "Gratis",
  pro: "Pro",
  starter: "Pemula",
  trial: "Uji coba",
};

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

function arePolicyValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => arePolicyValuesEqual(value, right[index]));
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(rightRecord, key)
      && arePolicyValuesEqual(leftRecord[key], rightRecord[key]));
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
          <p className="mt-1">Akun ini dapat membaca versi aktif, versi terjadwal, dan riwayat audit. Kapabilitas perubahan tidak tersedia; UI ini tidak menyamarkan batas server.</p>
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
  dailyLimitError,
  dirtySections,
  draft,
  editDraft,
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
  dailyLimitError: string | null;
  dirtySections: Set<PolicySection>;
  draft: AiPolicyBundleDto;
  editDraft: () => void;
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
          <p className="text-sm font-bold text-secondary-900">Pemetaan kuota / paket</p>
          <p className="mt-1 text-xs leading-5 text-secondary-600">Batas ini adalah nilai bawaan server untuk paket yang dipetakan ke akun penagihan; profil siswa lama tidak digunakan.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-secondary-700">
            {["free", "trial", "starter", "pro"].map((plan) => <span className="rounded-full border border-primary-100 bg-white px-3 py-1" key={plan}>{AI_PLAN_LABELS[plan] ?? plan}: kebijakan server</span>)}
          </div>
        </div>
        <label className={`${REFERENCE_FIELD_LABEL_CLASS_NAME} grid gap-2`} htmlFor="policy-daily-limit">
          Unit quota harian<FieldRequiredMark />
          <input aria-describedby={dailyLimitError ? "policy-daily-limit-error" : undefined} aria-invalid={Boolean(dailyLimitError)} className={REFERENCE_CONTROL_CLASS_NAMES.input} disabled={!canPolicy} id="policy-daily-limit" inputMode="numeric" max={50000} min={1000} onChange={(event) => { setDailyLimit(event.target.value); setQuotaConfig((current) => current ? { ...current, defaultDailyLimit: Number(event.target.value) } : current); }} required type="number" value={dailyLimit} />
        </label>
        <FieldError error={dailyLimitError ?? undefined} id="policy-daily-limit-error" />
      </ReferenceSurface>

      <ReferenceSurface className="rounded-2xl p-4" variant="inset">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-secondary-900">Input / output / reservasi per mode</p>
            <p className="mt-1 text-xs text-secondary-600">Batas tersertifikasi divalidasi server dan tidak mengubah jumlah percobaan ke penyedia.</p>
          </div>
          <span className="rounded-full bg-secondary-50 px-3 py-1 text-xs font-semibold text-secondary-700">maks. percobaan penyedia: {quotaConfig.maxProviderAttempts}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Object.entries(quotaConfig.modes).map(([mode, values]) => (
            <ReferenceSurface className="rounded-2xl p-3" key={mode} variant="inset">
              <p className="text-sm font-semibold text-secondary-900">{formatAiFeatureLabel(mode)}</p>
              <div className="mt-2 grid gap-2">
                <label className={`${REFERENCE_FIELD_LABEL_CLASS_NAME} grid gap-1`}>Batas input<FieldRequiredMark /><input aria-label={`${formatAiFeatureLabel(mode)} — batas input`} className={`${REFERENCE_CONTROL_CLASS_NAMES.input}`} disabled={!canPolicy} min={1000} onChange={(event) => { const num = event.currentTarget.valueAsNumber; if (Number.isFinite(num)) updateModeConfig(mode, "inputBound", num); }} required type="number" value={values.inputBound} /></label>
                <label className={`${REFERENCE_FIELD_LABEL_CLASS_NAME} grid gap-1`}>Batas output<FieldRequiredMark /><input aria-label={`${formatAiFeatureLabel(mode)} — batas output`} className={`${REFERENCE_CONTROL_CLASS_NAMES.input}`} disabled={!canPolicy} min={256} onChange={(event) => { const num = event.currentTarget.valueAsNumber; if (Number.isFinite(num)) updateModeConfig(mode, "hardOutputCap", num); }} required type="number" value={values.hardOutputCap} /></label>
                <label className={`${REFERENCE_FIELD_LABEL_CLASS_NAME} grid gap-1`}>Batas reservasi<FieldRequiredMark /><input aria-label={`${formatAiFeatureLabel(mode)} — batas reservasi`} className={`${REFERENCE_CONTROL_CLASS_NAMES.input}`} disabled={!canPolicy} min={1256} onChange={(event) => { const num = event.currentTarget.valueAsNumber; if (Number.isFinite(num)) updateModeConfig(mode, "reservationBound", num); }} required type="number" value={values.reservationBound} /></label>
              </div>
            </ReferenceSurface>
          ))}
        </div>
      </ReferenceSurface>

      <div className="grid gap-4 md:grid-cols-2">
        <ReferenceSurface className="rounded-2xl p-4" variant="inset">
          <p className="text-sm font-bold text-secondary-900">Penyelesaian</p>
          <label className={`${REFERENCE_FIELD_LABEL_CLASS_NAME} mt-3 grid gap-2`}>Usia maksimum menunggu (menit)<FieldRequiredMark /><input className={`${REFERENCE_CONTROL_CLASS_NAMES.input}`} disabled={!canGovern} min={30} max={360} onChange={(event) => { const num = event.currentTarget.valueAsNumber; if (Number.isFinite(num)) setSettlementConfig((current) => current ? { ...current, maxPendingAgeMinutes: num } : current); }} required type="number" value={settlementConfig.maxPendingAgeMinutes} /></label>
        </ReferenceSurface>
        <ReferenceSurface className="rounded-2xl p-4" variant="inset">
          <p className="text-sm font-bold text-secondary-900">Anggaran laporan / lonjakan</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className={`${REFERENCE_FIELD_LABEL_CLASS_NAME} grid gap-2`}>Unit / 24 jam<FieldRequiredMark /><input className={`${REFERENCE_CONTROL_CLASS_NAMES.input}`} disabled={!canPolicy} min={12} max={240} onChange={(event) => { const num = event.currentTarget.valueAsNumber; if (Number.isFinite(num)) setReportConfig((current) => current ? { ...current, unitLimit: num } : current); }} required type="number" value={reportConfig.unitLimit} /></label>
            <label className={`${REFERENCE_FIELD_LABEL_CLASS_NAME} grid gap-2`}>Diterima / 10 menit<FieldRequiredMark /><input className={`${REFERENCE_CONTROL_CLASS_NAMES.input}`} disabled={!canPolicy} min={1} max={60} onChange={(event) => { const num = event.currentTarget.valueAsNumber; if (Number.isFinite(num)) setReportConfig((current) => current ? { ...current, requestLimit: num } : current); }} required type="number" value={reportConfig.requestLimit} /></label>
            <label className={`${REFERENCE_FIELD_LABEL_CLASS_NAME} grid gap-2`}>Kelompok minimum (tetap)<input className={`${REFERENCE_CONTROL_CLASS_NAMES.input}`} disabled max={100} min={5} readOnly type="number" value={reportConfig.minimumGroupSize} /></label>
            <label className={`${REFERENCE_FIELD_LABEL_CLASS_NAME} grid gap-2`}>Rentang maksimum (hari, tetap)<input className={`${REFERENCE_CONTROL_CLASS_NAMES.input}`} disabled max={31} min={1} readOnly type="number" value={reportConfig.maxRangeDays} /></label>
          </div>
        </ReferenceSurface>
      </div>

      <ReferenceSurface className="rounded-2xl p-4" variant="inset">
        <p className="text-sm font-bold text-secondary-900">Bukti ke depan / retensi konten</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ["stageTtlHours", "Tahap TTL (jam)"],
            ["contextEvidenceTtlDays", "Bukti konteks (hari)"],
            ["acceptedKeyTtlDays", "Kunci diterima (hari)"],
            ["rejectedKeyTtlHours", "Kunci ditolak (jam)"],
            ["tombstoneTtlDays", "Penanda penghapusan (hari)"],
            ["admissionTelemetryTtlDays", "Telemetri penerimaan (hari)"],
            ["operationalMetadataTtlDays", "Metadata operasional (hari)"],
            ["activeArtifactEvidenceTtlDays", "Bukti artefak aktif (hari)"],
          ] as const).map(([field, label]) => (
            <label className={`${REFERENCE_FIELD_LABEL_CLASS_NAME} grid gap-2`} key={field}>{label}<FieldRequiredMark /><input className={`${REFERENCE_CONTROL_CLASS_NAMES.input}`} disabled={!canGovern} min={1} onChange={(event) => { setRetentionConfig((current) => current ? { ...current, [field]: Number(event.target.value) } : current); }} required type="number" value={retentionConfig[field] ?? ""} /></label>
          ))}
        </div>
      </ReferenceSurface>

      <div className="flex justify-end">
        <Button className="self-end" disabled={busy || draft.state !== "draft" || (!canPolicy && !canGovern) || dirtySections.size === 0} onClick={() => void editDraft()} type="button" variant="outline">Simpan bagian kebijakan</Button>
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
          <h2 className="text-xl font-extrabold tracking-[-0.03em] text-secondary-950">Riwayat versi</h2>
          <p className="mt-1 text-sm text-secondary-600">Riwayat audit tanpa isi konten; setiap transisi menyimpan aktor, digest, alasan, dan status.</p>
        </div>
        <Button disabled={busy} onClick={onRefresh} type="button" variant="outline">Muat ulang metadata</Button>
      </div>
      <div className="mt-5 hidden overflow-hidden sm:block">
        <Table className="table-fixed border-collapse text-left text-sm">
          <TableHeader className="border-b border-primary-100 text-xs uppercase tracking-[0.12em] text-secondary-500">
            <TableRow className="border-b-0 hover:bg-transparent">
              <TableHead className="px-3 py-3 font-bold">Versi</TableHead>
              <TableHead className="px-3 py-3 font-bold">Status</TableHead>
              <TableHead className="px-3 py-3 font-bold">Berlaku</TableHead>
              <TableHead className="px-3 py-3 font-bold">Alasan</TableHead>
              <TableHead className="px-3 py-3 font-bold">Aksi terakhir</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.length ? history.map((item) => (
              <TableRow className="border-b border-primary-50 last:border-0" key={`${item.bundleVersion}-${item.validationDigest}`}>
                <TableCell className="px-3 py-4 font-semibold text-secondary-900">{item.bundleVersion}</TableCell>
                <TableCell className="px-3 py-4 text-secondary-700">{formatAiPolicyState(item.state)}</TableCell>
                <TableCell className="px-3 py-4 text-secondary-700">{formatDate(item.effectiveAt)}</TableCell>
                <TableCell className="max-w-xs whitespace-normal px-3 py-4 text-secondary-600">{item.reason ?? "—"}</TableCell>
                <TableCell className="px-3 py-4 text-secondary-700"><span>{item.lastAction ? formatAiPolicyAction(item.lastAction) : "—"}</span>{item.state !== "active" && item.state !== "scheduled" ? null : <Button className="ml-3 h-8 px-2 text-xs" disabled={busy || !canPolicy} onClick={() => void rollbackBundle(item.id)} type="button" variant="outline">Pulihkan versi</Button>}</TableCell>
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
                <p className="mt-1 text-xs text-secondary-600">{formatAiPolicyState(item.state)} · {formatDate(item.effectiveAt)}</p>
              </div>
              {item.state !== "active" && item.state !== "scheduled" ? null : <Button className="h-8 px-2 text-xs" disabled={busy || !canPolicy} onClick={() => void rollbackBundle(item.id)} type="button" variant="outline">Pulihkan versi</Button>}
            </div>
            <dl className="mt-3 grid gap-2 text-xs">
              <div><dt className="text-secondary-500">Alasan</dt><dd className="mt-1 break-words text-secondary-700">{item.reason ?? "—"}</dd></div>
              <div><dt className="text-secondary-500">Aksi terakhir</dt><dd className="mt-1 break-words text-secondary-700">{item.lastAction ? formatAiPolicyAction(item.lastAction) : "—"}</dd></div>
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
  const [dailyLimitError, setDailyLimitError] = useState<string | null>(null);
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
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canGovern = metadata.capabilities.includes("canManageAiGovernance");
  const canPolicy = metadata.capabilities.includes("canManageAiPolicy");
  const capabilitySummary = useMemo(() => metadata.capabilities.length
    ? metadata.capabilities.map(formatAiCapabilityLabel).join(" · ")
    : "Hanya metadata", [metadata.capabilities]);

  const dirtySections = useMemo(() => {
    const changed = new Set<PolicySection>();
    if (!draft) return changed;

    const normalizedDailyLimit = Number(dailyLimit);
    if (
      !quotaConfig
      || !arePolicyValuesEqual(quotaConfig, draft.quotaConfig)
      || !Number.isSafeInteger(normalizedDailyLimit)
      || normalizedDailyLimit !== draft.quotaConfig.defaultDailyLimit
    ) changed.add("quota");
    if (!settlementConfig || !arePolicyValuesEqual(settlementConfig, draft.settlementConfig)) changed.add("settlement");
    if (!reportConfig || !arePolicyValuesEqual(reportConfig, draft.reportConfig)) changed.add("report");
    if (!retentionConfig || !arePolicyValuesEqual(retentionConfig, draft.retentionConfig)) changed.add("retention");
    return changed;
  }, [dailyLimit, draft, quotaConfig, reportConfig, retentionConfig, settlementConfig]);

  const dirtySectionLabel = dirtySections.size
    ? [...dirtySections].map(formatAiPolicySection).join(", ")
    : "";

  usePageStatusToast({
    active: busy || dirtySections.size > 0,
    message: busy
      ? "Memproses perubahan kebijakan…"
      : `Bagian kebijakan berubah: ${dirtySectionLabel}.`,
    variant: busy ? "info" : "warning",
  });

  function updateModeConfig(mode: string, field: "inputBound" | "hardOutputCap" | "reservationBound", value: number) {
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
      setDailyLimitError(null);
      setQuotaConfig(bundle.quotaConfig);
      setSettlementConfig(bundle.settlementConfig);
      setReportConfig(bundle.reportConfig);
      setRetentionConfig(bundle.retentionConfig);
      setEffectiveAt(bundle.effectiveAt.slice(0, 16));
    }
    const impact = resultPreview(payload);
    if (impact) setPreview(impact);
    return bundle;
  }

  async function refresh() {
    const response = await fetch("/api/admin/ai-policy", { cache: "no-store" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message ?? "Metadata kebijakan tidak tersedia.");
    }
    const payload = await response.json();
    setMetadata(payload.metadata);
  }

  async function refreshAfterMutation() {
    try {
      await refresh();
    } catch {
      showToast("Perubahan sudah diproses. Data kebijakan terbaru belum dapat dimuat.", {
        action: { label: "Muat ulang", onClick: () => window.location.reload() },
        description: "Muat ulang halaman untuk memeriksa hasilnya.",
        variant: "warning",
      });
    }
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
      showToast("Draf lengkap dibuat. Lanjutkan dengan mengedit bagian, memvalidasi, memeriksa pratinjau dampak, lalu meminta persetujuan operator kedua.", { variant: "success" });
      await refreshAfterMutation();
    } catch {
      showToast("Draf kebijakan belum berhasil dibuat. Coba lagi atau segarkan halaman.", { variant: "error" });
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
        setDailyLimitError("Batas kuota harian harus berupa bilangan bulat.");
        return;
      }
      setDailyLimitError(null);
      if (!quotaConfig) {
        setMessage("Snapshot kebijakan kuota belum lengkap.");
        return;
      }
      patch.quotaConfig = { ...quotaConfig, defaultDailyLimit: nextLimit };
    }
    if (dirtySections.has("settlement") && settlementConfig) patch.settlementConfig = settlementConfig;
    if (dirtySections.has("report") && reportConfig) patch.reportConfig = reportConfig;
    if (dirtySections.has("retention") && retentionConfig) patch.retentionConfig = retentionConfig;
    if (!Object.keys(patch).length) {
      setMessage("Pilih perubahan pada bagian yang menjadi kewenangan akun ini.");
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
      showToast("Perubahan bagian tersimpan ke draf.", { variant: "success" });
      await refreshAfterMutation();
    } catch {
      showToast("Perubahan pada draf belum berhasil disimpan. Coba lagi atau muat ulang draf.", { variant: "error" });
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
      showToast("Draf tervalidasi. Siap untuk pratinjau dampak dan persetujuan operator kedua.", { variant: "success" });
      await refreshAfterMutation();
    } catch {
      showToast("Draf belum berhasil divalidasi. Periksa statusnya lalu coba lagi.", { variant: "error" });
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
      showToast(`Pratinjau ${scope === "aggregate" ? "agregat" : "kategori"} selesai dibuat.`, { variant: "success" });
    } catch {
      showToast("Pratinjau dampak belum berhasil dibuat. Coba lagi.", { variant: "error" });
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
      showToast("Draf disetujui. Siap dijadwalkan dengan stempel waktu UTC yang valid.", { variant: "success" });
      await refreshAfterMutation();
    } catch {
      showToast("Persetujuan draf belum berhasil diproses. Periksa status draf sebelum mencoba lagi.", { variant: "error" });
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
      showToast("Draf berhasil dijadwalkan.", { variant: "success" });
      await refreshAfterMutation();
    } catch {
      showToast("Jadwal penerapan draf belum berhasil disimpan. Periksa status draf lalu coba lagi.", { variant: "error" });
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
      showToast(
        bundle
          ? "Kebijakan yang jatuh tempo berhasil diaktifkan."
          : "Tidak ada kebijakan jatuh tempo yang diaktifkan.",
        { variant: bundle ? "success" : "info" },
      );
      await refreshAfterMutation();
    } catch {
      showToast("Kebijakan yang sudah jatuh tempo belum berhasil diaktifkan. Periksa statusnya lalu coba lagi.", { variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function rollbackBundle(targetBundleId: string) {
    setBusy(true);
    setMessage(null);
    try {
      const payload = await sendCommand(`/api/admin/ai-policy/${targetBundleId}/rollback`, {
        clientRequestId: createRequestId("rollback"),
        reason: reason.trim(),
      });
      applyBundlePayload(payload);
      showToast("Draf pemulihan dibuat sebagai snapshot baru; riwayat lama tetap tidak berubah.", { variant: "success" });
      await refreshAfterMutation();
    } catch {
      showToast("Draf pemulihan belum berhasil dibuat. Periksa riwayat kebijakan lalu coba lagi.", { variant: "error" });
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
      showToast("Serah-terima retensi diterima sebagai menunggu. Tenggat dan siklus hidup belum berubah; T11 tetap menjadi pemilik commit.", { variant: "success" });
    } catch {
      showToast("Permintaan serah-terima retensi belum berhasil dibuat. Periksa detailnya lalu coba lagi.", { variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return {
    activateDraft,
    dailyLimitError,
    clearDailyLimitError: () => setDailyLimitError(null),
    approveDraft,
    busy,
    canGovern,
    canPolicy,
    capabilitySummary,
    createDraft,
    dailyLimit,
    dirtySections,
    draft,
    editDraft,
    effectiveAt,
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
  };
}

type AiPolicyPageState = ReturnType<typeof useAiPolicyPageState>;
type PolicyConfirmationRequester = (title: string, description: string, action: () => void | Promise<void>) => void;

function AiPolicyScopeSection({ state, requestConfirmation }: { state: AiPolicyPageState; requestConfirmation: PolicyConfirmationRequester }) {
  const { busy, canGovern, canPolicy, createDraft, metadata, reason, setReason } = state;

  return (
    <ReferenceSurface as="section" className="p-5 sm:p-6">
      <h2 className="text-xl font-extrabold tracking-[-0.03em] text-secondary-950">Ruang lingkup kebijakan yang dapat diedit</h2>
      <p className="mt-2 text-sm leading-6 text-secondary-600">Form perubahan bagian tersusun di backend dengan batas tetap: kuota 1.000–50.000, penyelesaian 30 menit–6 jam, laporan k≤5 dan maksimal 31 hari, serta percobaan penyedia tepat 2.</p>
      <div className="mt-5 grid gap-3 text-sm text-secondary-700 sm:grid-cols-2">
        <ReferenceSurface className="rounded-2xl p-4" variant="inset"><span className="font-bold text-secondary-950">Kebijakan</span><br />Kuota, mode, anggaran laporan<br /><span className="text-xs text-secondary-500">{canPolicy ? "Dapat mengedit bagian" : "Tidak diberikan"}</span></ReferenceSurface>
        <ReferenceSurface className="rounded-2xl p-4" variant="inset"><span className="font-bold text-secondary-950">Tata kelola</span><br />Penyelesaian, retensi bukti<br /><span className="text-xs text-secondary-500">{canGovern ? "Dapat mengedit bagian" : "Tidak diberikan"}</span></ReferenceSurface>
      </div>
      {metadata.canMutate ? (
        <div className="mt-6 border-t border-primary-100 pt-5">
          <label className={`${REFERENCE_FIELD_LABEL_CLASS_NAME} block`} htmlFor="policy-reason">Alasan perubahan<FieldRequiredMark /></label>
          <textarea
            className={`${REFERENCE_CONTROL_CLASS_NAMES.input} mt-2 min-h-24 resize-y`}
            id="policy-reason"
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Contoh: menyelaraskan batas report burst untuk periode ujian."
            required
            value={reason}
          />
          <Button
            className="mt-3"
            disabled={busy || reason.trim().length === 0}
            onClick={() => requestConfirmation(
              "Konfirmasi pembuatan draf kebijakan",
              `Draf baru akan dibuat dengan alasan: ${reason.trim()}. Draf belum aktif dan tidak mengubah akses sampai siklus hidup berikutnya selesai.`,
              createDraft,
            )}
            type="button"
            variant="default"
          >
            Buat draf lengkap
          </Button>
        </div>
      ) : null}
    </ReferenceSurface>
  );
}

function AiPolicyLifecycleActions({ state, requestConfirmation }: { state: AiPolicyPageState; requestConfirmation: PolicyConfirmationRequester }) {
  const { approveDraft, busy, draft, previewDraft, validateDraft } = state;
  if (!draft) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        disabled={busy || draft.state !== "draft"}
        onClick={() => requestConfirmation(
          "Konfirmasi validasi draf",
          "Server akan memvalidasi draf dan dapat mengubah status siklus hidupnya. Tidak ada kebijakan aktif yang ditulis sebelum persetujuan dan aktivasi terpisah.",
          validateDraft,
        )}
        type="button"
        variant="default"
      >Validasi draf</Button>
      <Button
        disabled={busy || draft.state !== "pending_approval"}
        onClick={() => requestConfirmation(
          "Konfirmasi pratinjau dampak",
          "Pratinjau membaca dampak yang hanya berlaku ke depan untuk penerimaan, reservasi laporan, dan bukti konten. Pratinjau tidak mengubah riwayat, tetapi dapat membuat reservasi audit.",
          () => void previewDraft("categorical"),
        )}
        type="button"
        variant="outline"
      >Pratinjau dampak</Button>
      <Button
        disabled={busy || draft.state !== "pending_approval"}
        onClick={() => requestConfirmation(
          "Konfirmasi persetujuan kebijakan",
          `Operator kedua akan menyetujui digest ${draft.validationDigest}. Perubahan belum aktif sampai dijadwalkan dan diaktifkan.`,
          approveDraft,
        )}
        type="button"
        variant="outline"
      >Setujui (operator kedua)</Button>
    </div>
  );
}

function AiPolicyAggregatePreview({ state, requestConfirmation }: { state: AiPolicyPageState; requestConfirmation: PolicyConfirmationRequester }) {
  const { busy, draft, previewDraft, previewFrom, previewTimezone, previewTo, setPreviewFrom, setPreviewTimezone, setPreviewTo } = state;
  if (!draft || draft.state !== "pending_approval") return null;

  return (
    <ReferenceSurface className="grid gap-3 rounded-2xl p-4" variant="inset">
      <div className="grid gap-2">
        <p className="text-sm font-semibold text-secondary-800">Rentang pratinjau agregat<FieldRequiredMark /></p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input aria-label="Awal rentang pratinjau" className={`${REFERENCE_CONTROL_CLASS_NAMES.input}`} onChange={(event) => setPreviewFrom(event.target.value)} placeholder="2026-08-01" required type="date" value={previewFrom} />
          <input aria-label="Akhir rentang pratinjau" className={`${REFERENCE_CONTROL_CLASS_NAMES.input}`} onChange={(event) => setPreviewTo(event.target.value)} placeholder="2026-08-08" required type="date" value={previewTo} />
        </div>
        <input aria-label="Zona waktu IANA pratinjau" className={`${REFERENCE_CONTROL_CLASS_NAMES.input}`} onChange={(event) => setPreviewTimezone(event.target.value)} required value={previewTimezone} />
        <Button
          disabled={busy || !previewFrom || !previewTo}
          onClick={() => requestConfirmation(
            "Konfirmasi pratinjau agregat",
            `Pratinjau agregat akan membaca rentang ${previewFrom} sampai ${previewTo} (${previewTimezone}) dan mencatat reservasi audit tanpa mengubah kebijakan aktif.`,
            () => void previewDraft("aggregate"),
          )}
          type="button"
          variant="outline"
        >Jalankan pratinjau agregat</Button>
      </div>
      <div className="text-xs leading-5 text-secondary-600">
        Pratinjau memerlukan rentang kalender lokal dengan batas akhir eksklusif, maksimum 31 hari. Biaya penuh tetap dicatat meskipun hasil ditekan atau tidak tersedia.
      </div>
    </ReferenceSurface>
  );
}

function AiPolicyScheduleControls({ state, requestConfirmation }: { state: AiPolicyPageState; requestConfirmation: PolicyConfirmationRequester }) {
  const { activateDraft, busy, draft, effectiveAt, scheduleDraft, setEffectiveAt } = state;
  if (!draft || (draft.state !== "pending_approval" && draft.state !== "scheduled")) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <label className={`${REFERENCE_FIELD_LABEL_CLASS_NAME} grid gap-2`} htmlFor="policy-effective-at">
        Waktu berlaku (lokal browser → UTC)<FieldRequiredMark />
        <input className={REFERENCE_CONTROL_CLASS_NAMES.input} id="policy-effective-at" onChange={(event) => setEffectiveAt(event.target.value)} required type="datetime-local" value={effectiveAt} />
      </label>
      <div className="flex items-end gap-2">
        <Button
          disabled={busy || draft.state !== "pending_approval" || !effectiveAt}
          onClick={() => requestConfirmation(
            "Konfirmasi jadwal kebijakan",
            `Kebijakan ini akan mulai memengaruhi penerimaan, reservasi laporan, dan bukti konten pada ${effectiveAt}. Waktu dikirim ke server sebagai UTC dan perubahan hanya berlaku ke depan.`,
            scheduleDraft,
          )}
          type="button"
          variant="default"
        >Jadwalkan</Button>
        <Button
          disabled={busy || draft.state !== "scheduled"}
          onClick={() => requestConfirmation(
            "Konfirmasi aktivasi kebijakan",
            "Aktivasi akan mengganti kebijakan aktif yang jatuh tempo. Server akan menyimpan aktor audit, digest, alasan, dan hasil perintah.",
            activateDraft,
          )}
          type="button"
          variant="outline"
        >Aktifkan yang jatuh tempo</Button>
      </div>
    </div>
  );
}

function AiPolicyPreviewStatus({ preview }: { preview: AiPolicyImpactPreviewDto | null }) {
  if (!preview) return null;

  return (
    <ReferenceSurface className="p-4 text-sm text-secondary-700" role="status" variant="inset">
      <p className="font-semibold text-secondary-900">Status pratinjau: {formatAiPreviewState(preview.state)}</p>
      <p className="mt-1">Penerimaan {formatAiImpactState(preview.effects.futureAdmissions.state)}; reservasi laporan {formatAiImpactState(preview.effects.futureReportReservations.state)}; bukti konten {formatAiImpactState(preview.effects.futureContentEvidence.state)}.</p>
    </ReferenceSurface>
  );
}

function AiPolicyLifecyclePanel({ state, requestConfirmation }: { state: AiPolicyPageState; requestConfirmation: PolicyConfirmationRequester }) {
  const { busy, canGovern, canPolicy, dailyLimit, dailyLimitError, dirtySections, draft, editDraft, preview, quotaConfig, reportConfig, retentionConfig, setDailyLimit, setQuotaConfig, setReportConfig, setRetentionConfig, setSettlementConfig, settlementConfig, updateModeConfig } = state;
  if (!draft) return null;

  return (
    <ReferenceSurface className="mt-6 space-y-4 p-4" data-testid="policy-lifecycle-controls" variant="inset">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-secondary-500">Draf terpilih</p>
          <p className="mt-1 break-all text-sm font-semibold text-secondary-900">{draft.bundleVersion} · {formatAiPolicyState(draft.state)} · revisi {draft.revision}</p>
        </div>
        <ReferenceStatusBadge label={formatAiProviderGateState(draft.providerGateState)} size="xs" status="blocked" />
      </div>
      {quotaConfig && settlementConfig && reportConfig && retentionConfig ? (
        <AiPolicyTypedControls
          busy={busy}
          canGovern={canGovern}
          canPolicy={canPolicy}
          dailyLimit={dailyLimit}
          dailyLimitError={dailyLimitError}
          dirtySections={dirtySections}
          draft={draft}
          editDraft={editDraft}
          quotaConfig={quotaConfig}
          reportConfig={reportConfig}
          retentionConfig={retentionConfig}
          setDailyLimit={(value) => { setDailyLimit(value); state.clearDailyLimitError(); }}
          setQuotaConfig={setQuotaConfig}
          setReportConfig={setReportConfig}
          setRetentionConfig={setRetentionConfig}
          setSettlementConfig={setSettlementConfig}
          settlementConfig={settlementConfig}
          updateModeConfig={updateModeConfig}
        />
      ) : null}
      <AiPolicyLifecycleActions requestConfirmation={requestConfirmation} state={state} />
      <AiPolicyAggregatePreview requestConfirmation={requestConfirmation} state={state} />
      <AiPolicyScheduleControls requestConfirmation={requestConfirmation} state={state} />
      <AiPolicyPreviewStatus preview={preview} />
    </ReferenceSurface>
  );
}

function AiPolicyRetentionSection({ state, requestConfirmation }: { state: AiPolicyPageState; requestConfirmation: PolicyConfirmationRequester }) {
  const { busy, canGovern, reason, requestedUpperBound, requestRetentionExtension, setRequestedUpperBound, setTargetReference, targetReference } = state;

  return (
    <ReferenceSurface as="section" className="p-5 sm:p-6">
      <h2 className="text-xl font-extrabold tracking-[-0.03em] text-secondary-950">Serah-terima retensi</h2>
      <p className="mt-2 text-sm leading-6 text-secondary-600">Permintaan perpanjangan hanya dicatat sebagai menunggu. Tidak ada tenggat, siklus hidup, klaim penghapusan, atau tindakan kunci yang berubah di Sprint 4.</p>
      {canGovern ? (
        <div className="mt-5 space-y-3">
          <label className={`${REFERENCE_FIELD_LABEL_CLASS_NAME} block`} htmlFor="retention-target">Referensi target<FieldRequiredMark /></label>
          <input className={REFERENCE_CONTROL_CLASS_NAMES.input} id="retention-target" maxLength={160} onChange={(event) => setTargetReference(event.target.value)} placeholder="ID/referensi tanpa isi" required value={targetReference} />
          <label className={`${REFERENCE_FIELD_LABEL_CLASS_NAME} block`} htmlFor="retention-bound">Batas waktu yang diminta (UTC)<FieldRequiredMark /></label>
          <input className={REFERENCE_CONTROL_CLASS_NAMES.input} id="retention-bound" onChange={(event) => setRequestedUpperBound(event.target.value)} placeholder="2026-12-31T00:00:00.000Z" required value={requestedUpperBound} />
          <Button
            disabled={busy || !targetReference.trim() || !requestedUpperBound.trim() || !reason.trim()}
            onClick={() => requestConfirmation(
              "Konfirmasi serah-terima retensi",
              `Serah-terima untuk ${targetReference.trim()} akan dicatat sebagai menunggu sampai ${requestedUpperBound.trim()}. Tenggat, siklus hidup, klaim penghapusan, dan tindakan kunci tidak berubah dari perintah ini.`,
              requestRetentionExtension,
            )}
            type="button"
            variant="outline"
          >Kirim serah-terima untuk ditinjau</Button>
        </div>
      ) : <ReferenceSurface className="mt-5 p-4 text-sm text-secondary-600" variant="inset">Kapabilitas tata kelola diperlukan untuk membuat serah-terima. Tidak ada tombol pengganti atau bypass.</ReferenceSurface>}
    </ReferenceSurface>
  );
}

function AiPolicyPageModule(props: AiPolicyPageModuleProps) {
  const state = useAiPolicyPageState(props);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingPolicyConfirmation | null>(null);
  const requestConfirmation: PolicyConfirmationRequester = (title, description, action) => {
    setPendingConfirmation({ action, description, title });
  };
  const confirmPendingAction = () => {
    const confirmation = pendingConfirmation;
    setPendingConfirmation(null);
    if (confirmation) void confirmation.action();
  };
  const requestRollback = (bundleId: string) => requestConfirmation(
    "Konfirmasi pemulihan kebijakan",
    `Pemulihan akan membuat snapshot kebijakan baru dari ${bundleId}. Riwayat lama tetap tidak berubah dan perubahan hanya berlaku setelah server menyelesaikan perintah dengan konteks audit.`,
    () => state.rollbackBundle(bundleId),
  );

  return (
    <div className="flex flex-col gap-8">
      <AlertDialog onOpenChange={(open) => { if (!open) setPendingConfirmation(null); }} open={Boolean(pendingConfirmation)}>
        <AlertDialogContent data-testid="policy-action-confirmation" variant="warning">
          <AlertDialogHeader>
            <AlertDialogMedia variant="warning" />
            <AlertDialogTitle>{pendingConfirmation?.title ?? "Konfirmasi perubahan kebijakan"}</AlertDialogTitle>
            <AlertDialogDescription>{pendingConfirmation?.description ?? "Perubahan ini belum dijalankan."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={state.busy}>Batal</AlertDialogCancel>
            <AlertDialogAction disabled={state.busy} onClick={confirmPendingAction} variant="default">Konfirmasi dan jalankan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReferencePageHeader
        actions={<div className="flex shrink-0 flex-wrap gap-2"><ReferenceStatusBadge label={formatAiProviderGateState("open_blocked")} size="sm" status="blocked" /><ReferenceStatusBadge label={state.capabilitySummary} size="sm" status={state.metadata.canMutate ? "active" : "neutral"} /></div>}
        title="Kebijakan kendali Vera AI"
      />

      <AiPolicyMetadataSummary metadata={state.metadata} />
      <section className="grid gap-5 md:grid-cols-2">
        <div>
          <AiPolicyScopeSection requestConfirmation={requestConfirmation} state={state} />
          <AiPolicyLifecyclePanel requestConfirmation={requestConfirmation} state={state} />
        </div>
        <AiPolicyRetentionSection requestConfirmation={requestConfirmation} state={state} />
      </section>
      <FieldError error={state.message ?? undefined} id="ai-policy-validation-error" />
      <AiPolicyAuditHistory
        busy={state.busy}
        canPolicy={state.canPolicy}
        history={state.metadata.history}
        onRefresh={() => void state.refresh().catch(() => showToast("Riwayat kebijakan belum berhasil dimuat. Segarkan halaman lalu coba lagi.", { variant: "error" }))}
        rollbackBundle={requestRollback}
      />
      <p className="text-sm text-secondary-600">Butuh konteks operasional lain? Kembali ke <Link className="font-bold text-primary-800 underline decoration-primary-200 underline-offset-4" href="/admin">dashboard admin</Link>.</p>
    </div>
  );
}

export { AiPolicyPageModule };

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { AiPolicyBundleDto, AiPolicyImpactPreviewDto, AiPolicyMetadataDto } from "@/lib/admin/ai-policy/contracts";

type AiPolicyPageModuleProps = {
  metadata: AiPolicyMetadataDto;
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
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.message === "string" ? payload.message : "Perintah kebijakan gagal.");
  }
  return payload;
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

function AiPolicyPageModule({ metadata: initialMetadata }: AiPolicyPageModuleProps) {
  const [metadata, setMetadata] = useState(initialMetadata);
  const [draft, setDraft] = useState<AiPolicyBundleDto | null>(null);
  const [dailyLimit, setDailyLimit] = useState("");
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
    ? metadata.capabilities.join(" · ")
    : "read-only metadata", [metadata.capabilities]);

  function applyBundlePayload(payload: unknown) {
    const bundle = resultBundle(payload);
    if (bundle) {
      setDraft(bundle);
      setDailyLimit(String(bundle.quotaConfig.defaultDailyLimit));
      setEffectiveAt(bundle.effectiveAt.slice(0, 16));
    }
    const impact = resultPreview(payload);
    if (impact) setPreview(impact);
    return bundle;
  }

  async function refresh() {
    const response = await fetch("/api/admin/ai-policy", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message ?? "Metadata kebijakan tidak tersedia.");
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
    const nextLimit = Number(dailyLimit);
    if (!Number.isSafeInteger(nextLimit)) {
      setMessage("Batas quota harian harus berupa bilangan bulat.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const payload = await sendCommand(`/api/admin/ai-policy/drafts/${draft.id}`, {
        clientRequestId: createRequestId("edit"),
        expectedRevision: draft.revision,
        patch: { quotaConfig: { ...draft.quotaConfig, defaultDailyLimit: nextLimit } },
        reason: reason.trim() || undefined,
      }, "PATCH");
      applyBundlePayload(payload);
      setMessage("Section quota tersimpan sebagai draft. Validasi tetap diperlukan sebelum approval.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draft tidak dapat diubah.");
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
      setMessage("Draft tervalidasi dan menunggu approval operator kedua.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Validasi gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function previewDraft(mode: "categorical" | "aggregate") {
    if (!draft) return;
    setBusy(true);
    setMessage(null);
    try {
      const range = mode === "aggregate" ? { from: previewFrom, to: previewTo, timezone: previewTimezone } : undefined;
      const payload = await sendCommand(`/api/admin/ai-policy/drafts/${draft.id}/preview`, {
        clientRequestId: createRequestId(`preview-${mode}`),
        expectedRevision: draft.revision,
        validationDigest: draft.validationDigest,
        mode,
        ...(range ? { range } : {}),
      });
      applyBundlePayload(payload);
      setMessage(mode === "aggregate" ? "Preview agregat selesai dengan suppression dan freshness yang tercatat." : "Preview kategorikal selesai.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preview gagal.");
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
        reason: reason.trim() || undefined,
      });
      applyBundlePayload(payload);
      setMessage("Approval dikirim. Server mewajibkan approver berbeda dari seluruh editor draft.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approval gagal.");
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
        reason: reason.trim() || undefined,
      });
      applyBundlePayload(payload);
      setMessage("Successor terjadwal menggunakan DB-clock boundary.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scheduling gagal.");
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
        reason: reason.trim() || undefined,
      });
      applyBundlePayload(payload);
      setMessage("Bundle diaktifkan setelah pemeriksaan digest dan batas efektif DB.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Aktivasi gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function rollbackBundle(bundleId: string) {
    setBusy(true);
    setMessage(null);
    try {
      const payload = await sendCommand(`/api/admin/ai-policy/${bundleId}/rollback`, {
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

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-[28px] border border-primary-100 bg-white p-6 shadow-[0_22px_55px_-44px_rgba(1,76,56,0.55)] md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-extrabold tracking-[-0.035em] text-secondary-950 md:text-4xl">Vera AI policy console</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-secondary-600">
              Kelola snapshot operasional yang berlaku untuk admission, report reservation, settlement, dan bukti content ke depan. Perubahan tidak menulis ulang histori.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 text-xs font-semibold text-secondary-600">
            <span className="rounded-full bg-primary-50 px-3 py-2 text-primary-900">Provider gate: open_blocked</span>
            <span className="rounded-full bg-secondary-50 px-3 py-2">{capabilitySummary}</span>
          </div>
        </div>
        <div className="mt-7 grid gap-4 border-t border-primary-100 pt-6 sm:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-secondary-500">Active version</p>
            <p className="mt-2 text-lg font-bold text-secondary-950">{metadata.active?.bundleVersion ?? "Belum ada"}</p>
            <p className="mt-1 text-xs text-secondary-600">Berlaku {formatDate(metadata.active?.effectiveAt)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-secondary-500">Scheduled successor</p>
            <p className="mt-2 text-lg font-bold text-secondary-950">{metadata.scheduled?.bundleVersion ?? "Tidak ada"}</p>
            <p className="mt-1 text-xs text-secondary-600">Batas DB {formatDate(metadata.scheduled?.effectiveAt)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-secondary-500">Last approver</p>
            <p className="mt-2 text-lg font-bold text-secondary-950">{metadata.active?.lastApprover?.display ?? "Belum tersedia"}</p>
            <p className="mt-1 break-all text-xs text-secondary-600">Digest {metadata.active?.validationDigest ?? "Belum tersedia"}</p>
          </div>
        </div>
      </section>

      {!metadata.canMutate ? (
        <section className="rounded-[24px] border border-primary-100 bg-[#eef8f1] p-5 text-sm leading-7 text-secondary-700">
          <p className="font-bold text-secondary-950">Akses metadata saja</p>
          <p className="mt-1">Akun ini dapat membaca active, scheduled, dan audit history. Capability mutation tidak tersedia; UI ini tidak menyamarkan batas server.</p>
        </section>
      ) : null}

      <section className="grid gap-5 md:grid-cols-2">
        <div className="rounded-[24px] border border-primary-100 bg-white p-6 shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)]">
          <h2 className="text-xl font-extrabold tracking-[-0.03em] text-secondary-950">Editable policy envelope</h2>
          <p className="mt-2 text-sm leading-6 text-secondary-600">Form perubahan section tersusun di backend dengan guardrail tetap: quota 1.000–50.000, settlement 30 menit–6 jam, report k≤5 dan maksimal 31 hari, serta provider attempts tepat 2.</p>
          <div className="mt-5 grid gap-3 text-sm text-secondary-700 sm:grid-cols-2">
            <div className="rounded-2xl bg-primary-50 p-4"><span className="font-bold text-secondary-950">Policy</span><br />Quota, mode, report budget<br /><span className="text-xs text-secondary-500">{canPolicy ? "Dapat mengedit section" : "Tidak diberikan"}</span></div>
            <div className="rounded-2xl bg-secondary-50 p-4"><span className="font-bold text-secondary-950">Governance</span><br />Settlement, evidence TTL<br /><span className="text-xs text-secondary-500">{canGovern ? "Dapat mengedit section" : "Tidak diberikan"}</span></div>
          </div>
          {metadata.canMutate ? (
            <div className="mt-6 border-t border-primary-100 pt-5">
              <label className="block text-sm font-bold text-secondary-900" htmlFor="policy-reason">Alasan perubahan</label>
              <textarea
                className="mt-2 min-h-24 w-full rounded-xl border border-primary-200 bg-[#f7faf8] px-3 py-3 text-sm text-secondary-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                id="policy-reason"
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Contoh: menyelaraskan batas report burst untuk periode ujian."
                value={reason}
              />
              <Button className="mt-3" disabled={busy || reason.trim().length === 0} onClick={createDraft} type="button">
                Buat complete draft
              </Button>
            </div>
          ) : null}
          {draft ? (
            <div className="mt-6 space-y-4 border-t border-primary-100 pt-5" data-testid="policy-lifecycle-controls">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-secondary-500">Selected draft</p>
                  <p className="mt-1 break-all text-sm font-semibold text-secondary-900">{draft.bundleVersion} · {draft.state} · rev {draft.revision}</p>
                </div>
                <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-900">providerGateState=open_blocked</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="grid gap-2 text-sm font-semibold text-secondary-800" htmlFor="policy-daily-limit">
                  Daily quota limit
                  <input className="h-11 rounded-xl border border-primary-200 bg-[#f7faf8] px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" id="policy-daily-limit" inputMode="numeric" maxLength={5} onChange={(event) => setDailyLimit(event.target.value)} value={dailyLimit} />
                </label>
                <Button className="self-end" disabled={busy || draft.state !== "draft" || !canPolicy} onClick={() => void editDraft()} type="button" variant="outline">Edit quota</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || draft.state !== "draft"} onClick={() => void validateDraft()} type="button">Validate draft</Button>
                <Button disabled={busy || draft.state !== "pending_approval"} onClick={() => void previewDraft("categorical")} type="button" variant="outline">Preview impact</Button>
                <Button disabled={busy || draft.state !== "pending_approval"} onClick={() => void approveDraft()} type="button" variant="outline">Approve (second operator)</Button>
              </div>
              {draft.state === "pending_approval" ? (
                <div className="grid gap-3 rounded-2xl bg-secondary-50 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="grid gap-2">
                    <p className="text-sm font-semibold text-secondary-800">Aggregate preview range</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input aria-label="Preview range from" className="h-10 rounded-xl border border-primary-200 bg-white px-3 text-sm" onChange={(event) => setPreviewFrom(event.target.value)} placeholder="2026-08-01" type="date" value={previewFrom} />
                      <input aria-label="Preview range to" className="h-10 rounded-xl border border-primary-200 bg-white px-3 text-sm" onChange={(event) => setPreviewTo(event.target.value)} placeholder="2026-08-08" type="date" value={previewTo} />
                    </div>
                    <input aria-label="Preview IANA timezone" className="h-10 rounded-xl border border-primary-200 bg-white px-3 text-sm" onChange={(event) => setPreviewTimezone(event.target.value)} value={previewTimezone} />
                    <Button disabled={busy || !previewFrom || !previewTo} onClick={() => void previewDraft("aggregate")} type="button" variant="outline">Run aggregate preview</Button>
                  </div>
                  <div className="text-xs leading-5 text-secondary-600">
                    Preview memerlukan rentang kalender lokal half-open, maksimum 31 hari. Cost penuh tetap dicatat walau hasil suppressed atau unavailable.
                  </div>
                </div>
              ) : null}
              {draft.state === "pending_approval" || draft.state === "scheduled" ? (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <label className="grid gap-2 text-sm font-semibold text-secondary-800" htmlFor="policy-effective-at">
                    Effective at (browser local → UTC)
                    <input className="h-11 rounded-xl border border-primary-200 bg-[#f7faf8] px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" id="policy-effective-at" onChange={(event) => setEffectiveAt(event.target.value)} type="datetime-local" value={effectiveAt} />
                  </label>
                  <div className="flex items-end gap-2">
                    <Button disabled={busy || draft.state !== "pending_approval" || !effectiveAt} onClick={() => void scheduleDraft()} type="button">Schedule</Button>
                    <Button disabled={busy || draft.state !== "scheduled"} onClick={() => void activateDraft()} type="button" variant="outline">Activate due</Button>
                  </div>
                </div>
              ) : null}
              {preview ? (
                <div className="rounded-2xl border border-primary-100 bg-primary-50/60 p-4 text-sm text-secondary-700" role="status">
                  <p className="font-semibold text-secondary-900">Preview state: {preview.state}</p>
                  <p className="mt-1">Admission {preview.effects.futureAdmissions.state}; report {preview.effects.futureReportReservations.state}; content {preview.effects.futureContentEvidence.state}.</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-[24px] border border-primary-100 bg-white p-6 shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)]">
          <h2 className="text-xl font-extrabold tracking-[-0.03em] text-secondary-950">Retention handoff</h2>
          <p className="mt-2 text-sm leading-6 text-secondary-600">Permintaan extension hanya dicatat sebagai pending. Tidak ada deadline, lifecycle, purge claim, atau key action yang berubah di Sprint 4.</p>
          {canGovern ? (
            <div className="mt-5 space-y-3">
              <label className="block text-sm font-bold text-secondary-900" htmlFor="retention-target">Referensi target</label>
              <input className="h-11 w-full rounded-xl border border-primary-200 bg-[#f7faf8] px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" id="retention-target" maxLength={160} onChange={(event) => setTargetReference(event.target.value)} placeholder="ID/content-free reference" value={targetReference} />
              <label className="block text-sm font-bold text-secondary-900" htmlFor="retention-bound">Batas waktu yang diminta (UTC)</label>
              <input className="h-11 w-full rounded-xl border border-primary-200 bg-[#f7faf8] px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" id="retention-bound" onChange={(event) => setRequestedUpperBound(event.target.value)} placeholder="2026-12-31T00:00:00.000Z" value={requestedUpperBound} />
              <Button disabled={busy || !targetReference.trim() || !requestedUpperBound.trim() || !reason.trim()} onClick={requestRetentionExtension} type="button" variant="outline">Kirim pending handoff</Button>
            </div>
          ) : <p className="mt-5 rounded-2xl bg-secondary-50 p-4 text-sm text-secondary-600">Governance capability diperlukan untuk membuat handoff. Tidak ada tombol pengganti atau bypass.</p>}
        </div>
      </section>

      {message ? <p aria-live="polite" className="rounded-2xl border border-primary-100 bg-white px-4 py-3 text-sm leading-6 text-secondary-700">{message}</p> : null}

      <section className="rounded-[24px] border border-primary-100 bg-white p-6 shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)] md:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-extrabold tracking-[-0.03em] text-secondary-950">Version history</h2>
            <p className="mt-1 text-sm text-secondary-600">Audit content-free; setiap transisi menyimpan actor, digest, alasan, dan state.</p>
          </div>
          <Button disabled={busy} onClick={() => void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Metadata tidak tersedia."))} type="button" variant="ghost">Refresh metadata</Button>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left text-sm">
            <thead className="border-b border-primary-100 text-xs uppercase tracking-[0.12em] text-secondary-500">
              <tr><th className="px-3 py-3 font-bold">Version</th><th className="px-3 py-3 font-bold">State</th><th className="px-3 py-3 font-bold">Effective</th><th className="px-3 py-3 font-bold">Reason</th><th className="px-3 py-3 font-bold">Last action</th></tr>
            </thead>
            <tbody>
              {metadata.history.length ? metadata.history.map((item) => (
                <tr className="border-b border-primary-50 last:border-0" key={`${item.bundleVersion}-${item.validationDigest}`}>
                  <td className="px-3 py-4 font-semibold text-secondary-900">{item.bundleVersion}</td><td className="px-3 py-4 text-secondary-700">{item.state}</td><td className="px-3 py-4 text-secondary-700">{formatDate(item.effectiveAt)}</td><td className="max-w-xs px-3 py-4 text-secondary-600">{item.reason ?? "—"}</td><td className="px-3 py-4 text-secondary-700"><span>{item.lastAction ?? "—"}</span>{item.state !== "active" && item.state !== "scheduled" ? null : <Button className="ml-3 h-8 px-2 text-xs" disabled={busy || !canPolicy} onClick={() => void rollbackBundle(item.id)} type="button" variant="ghost">Rollback</Button>}</td>
                </tr>
              )) : <tr><td className="px-3 py-8 text-secondary-600" colSpan={5}>Belum ada bundle yang tersimpan.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-sm text-secondary-600">Butuh konteks operasional lain? Kembali ke <Link className="font-bold text-primary-800 underline decoration-primary-200 underline-offset-4" href="/admin">dashboard admin</Link>.</p>
    </div>
  );
}

export { AiPolicyPageModule };

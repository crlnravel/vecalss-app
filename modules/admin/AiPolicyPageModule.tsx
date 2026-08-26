"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { AiPolicyMetadataDto } from "@/lib/admin/ai-policy/contracts";

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

async function sendCommand(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.message === "string" ? payload.message : "Perintah kebijakan gagal.");
  }
  return payload;
}

function AiPolicyPageModule({ metadata: initialMetadata }: AiPolicyPageModuleProps) {
  const [metadata, setMetadata] = useState(initialMetadata);
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
      await sendCommand("/api/admin/ai-policy/drafts", {
        clientRequestId: createRequestId("draft"),
        reason: reason.trim(),
      });
      setReason("");
      setMessage("Draft lengkap dibuat. Lanjutkan dengan edit section, validasi, preview, lalu minta approval operator kedua.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draft tidak dapat dibuat.");
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
                  <td className="px-3 py-4 font-semibold text-secondary-900">{item.bundleVersion}</td><td className="px-3 py-4 text-secondary-700">{item.state}</td><td className="px-3 py-4 text-secondary-700">{formatDate(item.effectiveAt)}</td><td className="max-w-xs px-3 py-4 text-secondary-600">{item.reason ?? "—"}</td><td className="px-3 py-4 text-secondary-700">{item.lastAction ?? "—"}</td>
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


"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Diff,
  Lock,
  Plus,
  RefreshCw,
  Zap,
} from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PortalShell } from "@/modules/portal/components/portal-shell";
import type { SessionContext } from "@/lib/auth/types";
import type { AiPolicyMetadataDto } from "@/lib/admin/ai-policy/contracts";
import { AiControlPlaneNav } from "./components/AiControlPlaneNav";
import { cn } from "@/lib/utils";

type PolicyLifecycleState =
  | "draft"
  | "validated"
  | "previewed"
  | "pending_approval"
  | "approved"
  | "scheduled"
  | "active"
  | "superseded";

export function AiPoliciesPageModule({
  session,
  metadata: initialMetadata,
}: {
  session: SessionContext;
  metadata?: AiPolicyMetadataDto | null;
}) {
  const [metadata, setMetadata] = useState<AiPolicyMetadataDto | null>(initialMetadata ?? null);
  const [isLoading, setIsLoading] = useState(!initialMetadata);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "editor" | "history">("active");

  // Policy revision state
  const [currentRevision, setCurrentRevision] = useState("VERA-POLICY-027");
  const [proposedRevision] = useState("VERA-POLICY-028 (Draf Usulan)");
  const [revisionState, setRevisionState] = useState<PolicyLifecycleState>("pending_approval");
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [activationMode, setActivationMode] = useState<"immediate" | "scheduled">("immediate");
  const [isActivating, setIsActivating] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const loadPolicyMetadata = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai-policy", { cache: "no-store" });
      if (!res.ok) throw new Error("Gagal memuat metadata kebijakan Vera AI.");
      const json = await res.json();
      setMetadata(json.metadata ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan sistem.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialMetadata) {
      const timer = window.setTimeout(() => {
        void loadPolicyMetadata();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [initialMetadata, loadPolicyMetadata]);

  function handleApprove() {
    setRevisionState("approved");
    setActionNotice("Kebijakan VERA-POLICY-028 telah disetujui oleh Admin C (Independen). Siap untuk deployment.");
  }

  function handleActivate() {
    setIsActivating(true);
    setTimeout(() => {
      setIsActivating(false);
      setShowActivationModal(false);
      setRevisionState("active");
      setCurrentRevision("VERA-POLICY-028");
      setActionNotice("Kebijakan VERA-POLICY-028 berhasil diaktifkan ke seluruh sistem produksi!");
    }, 1000);
  }

  return (
    <PortalShell
      activeAdminSection="ai"
      audience="admin"
      description="Tata kelola kebijakan versi terbitan (immutable bundles), simulasi dampak 7 hari, persetujuan ganda, dan aktivasi produksi."
      session={session}
      title="Kebijakan & Tata Kelola"
    >
      <div className="space-y-6">
        {/* Header Title */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-secondary-950 sm:text-3xl">
              Kebijakan & Tata Kelola
            </h1>
            <p className="mt-1 text-sm text-secondary-600">
              Tata kelola kebijakan versi terbitan (immutable bundles) — setiap perubahan kuota dan routing diverifikasi integritasnya sebelum diterapkan.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setActiveTab("editor");
                setRevisionState("draft");
                setActionNotice("Draf revisi baru dibuat. Silakan modifikasi parameter dan jalankan validasi & simulasi dampak.");
              }}
              type="button"
              variant="brand"
              className="gap-2"
            >
              <Plus className="size-4" />
              <span>Buat Draf Revisi</span>
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <AiControlPlaneNav activeTab="policies" />

        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="size-5 shrink-0 text-red-600" />
            <p>{error}</p>
          </div>
        )}

        {actionNotice && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-900">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="size-5 shrink-0 text-primary-700" />
              <span>{actionNotice}</span>
            </div>
            <button
              onClick={() => setActionNotice(null)}
              className="text-xs font-bold text-primary-700 hover:underline"
            >
              Tutup
            </button>
          </div>
        )}

        {isLoading && !metadata && (
          <div className="h-48 rounded-3xl bg-secondary-100 animate-pulse" />
        )}

        {/* Sub Navigation: Active Policy / Policy Editor & Review / History */}
        <div className="flex items-center gap-2 border-b border-primary-100 pb-3 text-sm">
          <button
            onClick={() => setActiveTab("active")}
            className={cn(
              "rounded-xl px-4 py-2 font-bold transition-all",
              activeTab === "active"
                ? "bg-primary-800 text-white shadow-xs"
                : "text-secondary-600 hover:bg-primary-50",
            )}
          >
            Kebijakan Aktif
          </button>
          <button
            onClick={() => setActiveTab("editor")}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-4 py-2 font-bold transition-all",
              activeTab === "editor"
                ? "bg-primary-800 text-white shadow-xs"
                : "text-secondary-600 hover:bg-primary-50",
            )}
          >
            <span>Review Usulan & Diff</span>
            {revisionState === "pending_approval" && (
              <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "rounded-xl px-4 py-2 font-bold transition-all",
              activeTab === "history"
                ? "bg-primary-800 text-white shadow-xs"
                : "text-secondary-600 hover:bg-primary-50",
            )}
          >
            Riwayat Versi & Korelasi Metrik
          </button>
        </div>

        {/* 1. Active Policy View */}
        {activeTab === "active" && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
              <div className="flex flex-col justify-between gap-4 border-b border-primary-50 pb-5 sm:flex-row sm:items-center">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-secondary-500">Kebijakan Aktif</span>
                    <h2 className="text-xl font-extrabold text-secondary-950">{currentRevision}</h2>
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-800 border border-primary-100">
                      <CheckCircle2 className="size-3.5" />
                      AKTIF DI PRODUKSI
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-secondary-500">
                    Diaktifkan 27 Aug 2026, 14:20 WIB · Digest Integritas: <code className="font-mono text-secondary-700">83b1...a772</code>
                  </p>
                </div>

                <Button
                  onClick={() => {
                    setActiveTab("editor");
                  }}
                  variant="reference"
                  className="gap-2"
                >
                  <Diff className="size-4" />
                  <span>Lihat Usulan Perubahan</span>
                </Button>
              </div>

              {/* Policy Sections Grid */}
              <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {/* Capabilities */}
                <div className="rounded-2xl border border-primary-100 bg-primary-50/30 p-4">
                  <h4 className="font-bold text-secondary-950 text-xs uppercase tracking-wider mb-3">Kemampuan (Capabilities)</h4>
                  <ul className="space-y-1.5 text-xs">
                    <li className="flex justify-between font-mono"><span>vera.chat</span><span className="font-bold text-primary-700">Aktif</span></li>
                    <li className="flex justify-between font-mono"><span>vera.analysis</span><span className="font-bold text-primary-700">Aktif</span></li>
                    <li className="flex justify-between font-mono"><span>vera.drill</span><span className="font-bold text-primary-700">Aktif</span></li>
                    <li className="flex justify-between font-mono"><span>vera.ptn</span><span className="font-bold text-secondary-700">Khusus Premium</span></li>
                    <li className="flex justify-between font-mono"><span>vera.route</span><span className="font-bold text-primary-700">Aktif</span></li>
                    <li className="flex justify-between font-mono"><span>vera.summary</span><span className="font-bold text-primary-700">Aktif</span></li>
                    <li className="flex justify-between font-mono"><span>vera.review</span><span className="font-bold text-primary-700">Aktif</span></li>
                  </ul>
                </div>

                {/* Quota Limits */}
                <div className="rounded-2xl border border-primary-100 bg-primary-50/30 p-4">
                  <h4 className="font-bold text-secondary-950 text-xs uppercase tracking-wider mb-3">Batas Kuota</h4>
                  <ul className="space-y-1.5 text-xs text-secondary-700">
                    <li className="flex justify-between"><span>Tier Free:</span><strong className="text-secondary-950">10 unit / hari</strong></li>
                    <li className="flex justify-between"><span>Tier Premium:</span><strong className="text-secondary-950">20 unit / hari</strong></li>
                    <li className="flex justify-between"><span>Tier Kapten:</span><strong className="text-secondary-950">50 unit / hari</strong></li>
                    <li className="flex justify-between border-t border-primary-100 pt-1.5">
                      <span>Maks Overrun Debt:</span>
                      <strong className="text-secondary-950">2 unit</strong>
                    </li>
                  </ul>
                </div>

                {/* Admission Controls */}
                <div className="rounded-2xl border border-primary-100 bg-primary-50/30 p-4">
                  <h4 className="font-bold text-secondary-950 text-xs uppercase tracking-wider mb-3">Kontrol Admisi</h4>
                  <ul className="space-y-1.5 text-xs text-secondary-700">
                    <li className="flex justify-between"><span>Jendela Burst:</span><strong className="text-secondary-950">10 menit</strong></li>
                    <li className="flex justify-between"><span>Batas Permintaan Burst:</span><strong className="text-secondary-950">8 request</strong></li>
                    <li className="flex justify-between"><span>Plafon Konkurensi:</span><strong className="text-secondary-950">2 per siswa</strong></li>
                    <li className="flex justify-between border-t border-primary-100 pt-1.5">
                      <span>Maks Upstream Retry:</span>
                      <strong className="text-secondary-950">2 percobaan</strong>
                    </li>
                  </ul>
                </div>

                {/* Governance & Retention */}
                <div className="rounded-2xl border border-primary-100 bg-primary-50/30 p-4">
                  <h4 className="font-bold text-secondary-950 text-xs uppercase tracking-wider mb-3">Retensi & TTL</h4>
                  <ul className="space-y-1.5 text-xs text-secondary-700">
                    <li className="flex justify-between"><span>Maks Retensi Log:</span><strong className="text-secondary-950">30 hari</strong></li>
                    <li className="flex justify-between"><span>Stage TTL:</span><strong className="text-secondary-950">24 jam</strong></li>
                    <li className="flex justify-between"><span>Masa Kunci Diterima:</span><strong className="text-secondary-950">90 hari</strong></li>
                    <li className="flex justify-between border-t border-primary-100 pt-1.5">
                      <span>Ambang Privasi Min:</span>
                      <strong className="text-secondary-950 font-mono">k = 5</strong>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. Revision Review, Diff & Impact Preview */}
        {activeTab === "editor" && (
          <div className="space-y-6">
            {/* Lifecycle Progression Stepper */}
            <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
              <div className="flex flex-col justify-between gap-2 border-b border-primary-50 pb-4 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-base font-bold text-secondary-950">Alur Siklus Hidup Kebijakan</h3>
                  <p className="mt-0.5 text-xs text-secondary-500">
                    Setiap perubahan konfigurasi mengikuti jalur deterministik dan diverifikasi integritasnya
                  </p>
                </div>
                <span className="rounded-full bg-primary-50 px-3 py-1 font-mono text-xs font-bold text-primary-800 border border-primary-100">
                  {proposedRevision}
                </span>
              </div>

              {/* Stepper Bar */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs">
                {[
                  { id: "draft", label: "DRAF", done: true },
                  { id: "validated", label: "TERVALIDASI", done: true },
                  { id: "previewed", label: "SIMULASI DAMPAK", done: true },
                  { id: "pending_approval", label: "MENUNGGU PERSETUJUAN", current: revisionState === "pending_approval", done: revisionState === "approved" || revisionState === "active" },
                  { id: "approved", label: "DISETUJUI", done: revisionState === "approved" || revisionState === "active" },
                  { id: "active", label: "AKTIF DI PRODUKSI", done: revisionState === "active" },
                ].map((step, idx) => (
                  <div key={step.id} className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold transition-all",
                        step.done
                          ? "bg-primary-800 text-white"
                          : step.current
                          ? "bg-amber-100 text-amber-900 border border-amber-300 ring-2 ring-amber-200"
                          : "bg-secondary-100 text-secondary-500",
                      )}
                    >
                      <span>{step.label}</span>
                      {step.done && <CheckCircle2 className="size-3.5 text-sea-glass" />}
                    </div>
                    {idx < 5 && <ArrowRight className="size-3.5 text-secondary-400 hidden lg:block" />}
                  </div>
                ))}
              </div>
            </div>

            {/* Before vs Proposed Diff Section */}
            <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
              <div className="border-b border-primary-50 pb-4">
                <h3 className="text-base font-bold text-secondary-950">Perubahan Konfigurasi (Before / After Diff)</h3>
                <p className="mt-0.5 text-xs text-secondary-500">
                  Perbandingan eksplisit antara nilai aktif saat ini dan nilai yang diusulkan
                </p>
              </div>

              <div className="mt-6 space-y-4">
                {/* Diff Item 1 */}
                <div className="flex flex-col justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50/30 p-4 sm:flex-row sm:items-center">
                  <div>
                    <span className="text-xs font-bold uppercase text-secondary-500">Batas Kuota Harian Premium</span>
                    <p className="text-xs text-secondary-600">Alokasi kuota harian untuk siswa tier Premium</p>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-sm">
                    <span className="rounded-lg bg-red-50 px-2.5 py-1 text-red-700 border border-red-200 line-through">
                      20 unit / hari
                    </span>
                    <ArrowRight className="size-4 text-secondary-400" />
                    <span className="rounded-lg bg-primary-100 px-2.5 py-1 text-primary-900 font-bold border border-primary-300">
                      30 unit / hari
                    </span>
                  </div>
                </div>

                {/* Diff Item 2 */}
                <div className="flex flex-col justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50/30 p-4 sm:flex-row sm:items-center">
                  <div>
                    <span className="text-xs font-bold uppercase text-secondary-500">Bobot Fitur: vera.drill</span>
                    <p className="text-xs text-secondary-600">Konsumsi unit kuota untuk sesi adaptive drill soal</p>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-sm">
                    <span className="rounded-lg bg-red-50 px-2.5 py-1 text-red-700 border border-red-200 line-through">
                      4 unit
                    </span>
                    <ArrowRight className="size-4 text-secondary-400" />
                    <span className="rounded-lg bg-primary-100 px-2.5 py-1 text-primary-900 font-bold border border-primary-300">
                      3 unit
                    </span>
                  </div>
                </div>

                {/* Diff Item 3 */}
                <div className="flex flex-col justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50/30 p-4 sm:flex-row sm:items-center">
                  <div>
                    <span className="text-xs font-bold uppercase text-secondary-500">Ambang Timeout Gateway OpenRouter</span>
                    <p className="text-xs text-secondary-600">Waktu tunggu sebelum dialihkan ke model fallback</p>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-sm">
                    <span className="rounded-lg bg-red-50 px-2.5 py-1 text-red-700 border border-red-200 line-through">
                      10.000 ms
                    </span>
                    <ArrowRight className="size-4 text-secondary-400" />
                    <span className="rounded-lg bg-primary-100 px-2.5 py-1 text-primary-900 font-bold border border-primary-300">
                      8.000 ms
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 7-Day First-Class Impact Preview */}
            <div className="rounded-3xl border border-primary-200 bg-primary-50/40 p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-primary-200 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-primary-950">
                    Simulasi Dampak (Berdasarkan Data 7 Hari Terakhir)
                  </h3>
                  <p className="mt-0.5 text-xs text-primary-800">
                    Proyeksi matematis deterministik sebelum perubahan disetujui
                  </p>
                </div>
                <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-bold text-primary-900 border border-primary-300">
                  Model Deterministik
                </span>
              </div>

              {/* Impact Comparison Grid */}
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl bg-white p-4 border border-primary-100">
                  <p className="text-xs text-secondary-500 font-semibold">Tingkat Hard-Lock</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-sm line-through text-secondary-400">6.2%</span>
                    <ArrowRight className="size-3 text-secondary-400" />
                    <span className="text-xl font-extrabold text-primary-700">2.8%</span>
                  </div>
                  <p className="mt-1 text-[11px] font-bold text-primary-700">↓ 3.4 pp penurunan terkunci</p>
                </div>

                <div className="rounded-2xl bg-white p-4 border border-primary-100">
                  <p className="text-xs text-secondary-500 font-semibold">Estimasi Biaya Provider / Hari</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-sm line-through text-secondary-400">$48.20</span>
                    <ArrowRight className="size-3 text-secondary-400" />
                    <span className="text-xl font-extrabold text-secondary-950">$61.70</span>
                  </div>
                  <p className="mt-1 text-[11px] font-bold text-secondary-600">+$405 proyeksi bulanan</p>
                </div>

                <div className="rounded-2xl bg-white p-4 border border-primary-100">
                  <p className="text-xs text-secondary-500 font-semibold">Konsumsi Kuota</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-sm line-through text-secondary-400">71.200</span>
                    <ArrowRight className="size-3 text-secondary-400" />
                    <span className="text-xl font-extrabold text-secondary-950">83.900</span>
                  </div>
                  <p className="mt-1 text-[11px] font-bold text-secondary-600">+17.8% kapasitas terpakai</p>
                </div>

                <div className="rounded-2xl bg-white p-4 border border-primary-100">
                  <p className="text-xs text-secondary-500 font-semibold">Puncak Konkurensi</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-sm line-through text-secondary-400">141</span>
                    <ArrowRight className="size-3 text-secondary-400" />
                    <span className="text-xl font-extrabold text-amber-700">162</span>
                  </div>
                  <p className="mt-1 text-[11px] font-bold text-amber-700">+15% beban puncak</p>
                </div>
              </div>

              {/* Risk Warning Box */}
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                <AlertTriangle className="size-5 shrink-0 text-amber-700 mt-0.5" />
                <div>
                  <p className="font-bold">Potensi Risiko Kapasitas Terdeteksi</p>
                  <p className="mt-0.5 leading-relaxed">
                    Beban puncak (concurrency) diproyeksikan meningkat 15%. Kapasitas headroom gateway saat ini adalah sekitar 18%.
                    Pastikan limit upstream RPM/TPM telah dinaikkan sebelum periode ujian berlangsung.
                  </p>
                </div>
              </div>
            </div>

            {/* Dual Approval Governance Section */}
            <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
              <div className="border-b border-primary-50 pb-4">
                <h3 className="text-base font-bold text-secondary-950">Persetujuan Ganda (Dual Approval)</h3>
                <p className="mt-0.5 text-xs text-secondary-500">
                  Prinsip Four-Eyes: Perubahan memerlukan persetujuan operator independen yang tidak ikut menyunting draf
                </p>
              </div>

              <div className="mt-5 grid gap-6 md:grid-cols-2">
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between border-b border-secondary-100 pb-2">
                    <span className="text-secondary-500">Dibuat oleh:</span>
                    <strong className="text-secondary-950">Admin A (Ravel)</strong>
                  </div>
                  <div className="flex justify-between border-b border-secondary-100 pb-2">
                    <span className="text-secondary-500">Penyunting:</span>
                    <strong className="text-secondary-950">Admin A, Admin B</strong>
                  </div>
                  <div className="flex justify-between border-b border-secondary-100 pb-2">
                    <span className="text-secondary-500">Validation Digest:</span>
                    <code className="font-mono text-secondary-700">83b1...a772</code>
                  </div>
                  <div className="flex justify-between pb-2">
                    <span className="text-secondary-500">Aturan Tata Kelola:</span>
                    <span className="font-bold text-primary-700">Wajib 1 persetujuan independen</span>
                  </div>
                </div>

                <div className="flex flex-col justify-between rounded-2xl bg-secondary-50 p-4 text-xs">
                  {revisionState === "pending_approval" ? (
                    <>
                      <div>
                        <span className="font-bold text-secondary-800">Status Persetujuan:</span>
                        <p className="mt-1 text-secondary-600">
                          Menunggu persetujuan dari operator independen.
                        </p>
                        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white p-3 border border-secondary-200 text-secondary-600">
                          <Lock className="size-4 shrink-0 text-amber-600" />
                          <span>
                            Operator yang menyunting draf tidak dapat menyetujui revisinya sendiri.
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        <Button
                          onClick={handleApprove}
                          type="button"
                          variant="brand"
                          className="flex-1"
                        >
                          Setujui Revisi (Admin C)
                        </Button>
                        <Button
                          onClick={() => setRevisionState("draft")}
                          type="button"
                          variant="ghost"
                          className="text-red-700"
                        >
                          Tolak Draf
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-100 px-3 py-1 font-bold text-primary-900 mb-2">
                        <CheckCircle2 className="size-3.5" />
                        DISETUJUI OLEH ADMIN C
                      </span>
                      <p className="text-secondary-600 text-xs">
                        Disetujui 28 Aug 2026 · Snapshot Digest: <code className="font-mono text-secondary-800">20df...83ad</code>
                      </p>

                      <div className="mt-4">
                        <Button
                          onClick={() => setShowActivationModal(true)}
                          type="button"
                          variant="brand"
                          className="w-full gap-2"
                        >
                          <Zap className="size-4" />
                          <span>Terapkan Kebijakan ke Produksi</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Deployment Activation Modal */}
            <Dialog open={showActivationModal} onOpenChange={setShowActivationModal}>
              <DialogContent className="max-w-lg rounded-3xl p-6">
                <DialogHeader>
                  <DialogTitle className="text-xl font-extrabold text-secondary-950">
                    Aktivasi Kebijakan VERA-POLICY-028 ke Produksi
                  </DialogTitle>
                  <DialogDescription className="text-xs text-secondary-600">
                    Aktivasi kebijakan adalah deployment konfigurasi produksi yang memiliki blast radius ke seluruh kuota & routing siswa.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 text-xs my-3">
                  <div className="rounded-2xl bg-secondary-50 p-4">
                    <span className="font-bold text-secondary-800 uppercase tracking-wider text-[10px] block mb-2">
                      Ringkasan Perubahan
                    </span>
                    <ul className="space-y-1 text-secondary-700">
                      <li>• Kuota harian Premium: 20 → 30 unit</li>
                      <li>• Bobot fitur vera.drill: 4 → 3 unit</li>
                      <li>• Timeout fallback: 10 detik → 8 detik</li>
                    </ul>
                  </div>

                  <div className="rounded-2xl bg-primary-50 p-4 border border-primary-100">
                    <span className="font-bold text-primary-900 uppercase tracking-wider text-[10px] block mb-2">
                      Proyeksi Efek
                    </span>
                    <ul className="space-y-1 text-primary-800">
                      <li>• Penurunan kuota terkunci: ↓ 3.4 pp</li>
                      <li>• Proyeksi kenaikan biaya harian: ↑ 28%</li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <span className="font-bold text-secondary-800">Waktu Penerapan:</span>
                    <div className="grid grid-cols-2 gap-2">
                      <label
                        className={cn(
                          "flex items-center gap-2 rounded-xl border p-3 cursor-pointer",
                          activationMode === "immediate" ? "border-primary-600 bg-primary-50/50" : "border-secondary-200",
                        )}
                      >
                        <input
                          type="radio"
                          name="activation"
                          checked={activationMode === "immediate"}
                          onChange={() => setActivationMode("immediate")}
                        />
                        <span className="font-semibold text-secondary-900">Segera (Immediate)</span>
                      </label>
                      <label
                        className={cn(
                          "flex items-center gap-2 rounded-xl border p-3 cursor-pointer",
                          activationMode === "scheduled" ? "border-primary-600 bg-primary-50/50" : "border-secondary-200",
                        )}
                      >
                        <input
                          type="radio"
                          name="activation"
                          checked={activationMode === "scheduled"}
                          onChange={() => setActivationMode("scheduled")}
                        />
                        <span className="font-semibold text-secondary-900">Terjadwal (DB Clock)</span>
                      </label>
                    </div>
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    variant="reference"
                    onClick={() => setShowActivationModal(false)}
                    disabled={isActivating}
                  >
                    Batal
                  </Button>
                  <Button
                    variant="brand"
                    onClick={handleActivate}
                    disabled={isActivating}
                    className="gap-2"
                  >
                    {isActivating ? <RefreshCw className="size-4 animate-spin" /> : <Zap className="size-4" />}
                    <span>Konfirmasi & Terapkan</span>
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* 3. History with Metric Correlation */}
        {activeTab === "history" && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
              <div className="border-b border-primary-50 pb-4">
                <h3 className="text-base font-bold text-secondary-950">Riwayat Versi Kebijakan & Korelasi Metrik</h3>
                <p className="mt-0.5 text-xs text-secondary-500">
                  Audit jejak aktivasi kebijakan yang dapat dikorelasikan langsung dengan grafik metrik keandalan
                </p>
              </div>

              {/* Version History Table */}
              <div className="mt-6 overflow-hidden rounded-2xl border border-primary-100">
                <table className="w-full text-left text-xs">
                  <thead className="bg-primary-50/40 font-bold text-secondary-950">
                    <tr>
                      <th className="p-3.5">Versi</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Waktu Efektif</th>
                      <th className="p-3.5">Perubahan Utama</th>
                      <th className="p-3.5">Disetujui Oleh</th>
                      <th className="p-3.5 text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-50 text-secondary-700">
                    <tr className="bg-primary-50/20">
                      <td className="p-3.5 font-bold font-mono text-secondary-950">VERA-POLICY-027</td>
                      <td className="p-3.5">
                        <span className="rounded-full bg-primary-100 px-2 py-0.5 font-bold text-primary-800 text-[10px]">
                          AKTIF
                        </span>
                      </td>
                      <td className="p-3.5">27 Aug 2026, 14:20 WIB</td>
                      <td className="p-3.5">Penyesuaian burst 10m & quota overrun debt</td>
                      <td className="p-3.5">Admin C</td>
                      <td className="p-3.5 text-right">
                        <span className="text-secondary-400 font-semibold">Aktif</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-bold font-mono text-secondary-950">VERA-POLICY-026</td>
                      <td className="p-3.5">
                        <span className="rounded-full bg-secondary-100 px-2 py-0.5 font-bold text-secondary-700 text-[10px]">
                          SUPERSEDED
                        </span>
                      </td>
                      <td className="p-3.5">20 Aug 2026, 09:00 WIB</td>
                      <td className="p-3.5">Inisialisasi OpenRouter free provider fallback</td>
                      <td className="p-3.5">Admin B</td>
                      <td className="p-3.5 text-right">
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-primary-700">
                          Rollback
                        </Button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

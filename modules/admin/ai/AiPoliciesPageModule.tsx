"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
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
import { ReferenceStatusBadge } from "@/components/dashboard/reference-dashboard-primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

function ActivePolicyView({
  currentRevision,
  onOpenEditor,
}: {
  currentRevision: string;
  onOpenEditor: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-primary-50 pb-5 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary-500">Kebijakan Aktif</span>
              <h2 className="break-words text-xl font-extrabold text-secondary-950">{currentRevision}</h2>
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
            onClick={onOpenEditor}
            variant="reference"
            className="min-h-[44px] gap-2"
          >
            <Diff className="size-4" />
            <span>Lihat Usulan Perubahan</span>
          </Button>
        </div>

        {/* Policy Sections Grid */}
        <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-primary-100 bg-primary-50/30 p-4">
            <h3 className="mb-3 font-bold text-secondary-950 text-xs uppercase tracking-wider">Kemampuan (Capabilities)</h3>
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

          <div className="rounded-2xl border border-primary-100 bg-primary-50/30 p-4">
            <h3 className="mb-3 font-bold text-secondary-950 text-xs uppercase tracking-wider">Batas Kuota</h3>
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

          <div className="rounded-2xl border border-primary-100 bg-primary-50/30 p-4">
            <h3 className="mb-3 font-bold text-secondary-950 text-xs uppercase tracking-wider">Kontrol Admisi</h3>
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

          <div className="rounded-2xl border border-primary-100 bg-primary-50/30 p-4">
            <h3 className="mb-3 font-bold text-secondary-950 text-xs uppercase tracking-wider">Retensi & TTL</h3>
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
  );
}

function PolicyActivationModal({
  activationMode,
  handleActivate,
  isActivating,
  setActivationMode,
  setShowActivationModal,
  showActivationModal,
}: {
  activationMode: "immediate" | "scheduled";
  handleActivate: () => void;
  isActivating: boolean;
  setActivationMode: (mode: "immediate" | "scheduled") => void;
  setShowActivationModal: (open: boolean) => void;
  showActivationModal: boolean;
}) {
  return (
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

          <fieldset className="space-y-2">
            <legend className="font-bold text-secondary-800">Waktu Penerapan:</legend>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={cn(
                  "flex min-h-[44px] items-center gap-2 rounded-xl border p-3 cursor-pointer",
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
                  "flex min-h-[44px] items-center gap-2 rounded-xl border p-3 cursor-pointer",
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
          </fieldset>
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
            {isActivating ? <RefreshCw className="size-4 animate-spin motion-reduce:animate-none" /> : <Zap className="size-4" />}
            <span>Konfirmasi & Terapkan</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PolicyEditorView({
  handleApprove,
  proposedRevision,
  revisionState,
  setShowActivationModal,
  setRevisionState,
}: {
  handleApprove: () => void;
  proposedRevision: string;
  revisionState: PolicyLifecycleState;
  setShowActivationModal: (open: boolean) => void;
  setRevisionState: (state: PolicyLifecycleState) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Lifecycle Progression Stepper */}
      <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-2 border-b border-primary-50 pb-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-bold text-secondary-950">Alur Siklus Hidup Kebijakan</h2>
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
                  "flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold transition-all motion-reduce:transition-none",
                  step.done
                    ? "bg-primary-800 text-white"
                    : step.current
                    ? "bg-warning-100 text-warning-900 border border-warning-300 ring-2 ring-warning-200"
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
          <h2 className="text-base font-bold text-secondary-950">Perubahan Konfigurasi (Before / After Diff)</h2>
          <p className="mt-0.5 text-xs text-secondary-500">
            Perbandingan eksplisit antara nilai aktif saat ini dan nilai yang diusulkan
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50/30 p-4 sm:flex-row sm:items-center">
            <div>
              <span className="text-xs font-bold uppercase text-secondary-500">Batas Kuota Harian Premium</span>
              <p className="text-xs text-secondary-600">Alokasi kuota harian untuk siswa tier Premium</p>
            </div>
            <div className="flex items-center gap-3 font-mono text-sm">
              <span className="rounded-lg bg-student-status-danger-bg px-2.5 py-1 text-student-status-danger-fg border border-student-status-danger-border line-through">
                20 unit / hari
              </span>
              <ArrowRight className="size-4 text-secondary-400" />
              <span className="rounded-lg bg-primary-100 px-2.5 py-1 text-primary-900 font-bold border border-primary-300">
                30 unit / hari
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50/30 p-4 sm:flex-row sm:items-center">
            <div>
              <span className="text-xs font-bold uppercase text-secondary-500">Bobot Fitur: vera.drill</span>
              <p className="text-xs text-secondary-600">Konsumsi unit kuota untuk sesi adaptive drill soal</p>
            </div>
            <div className="flex items-center gap-3 font-mono text-sm">
              <span className="rounded-lg bg-student-status-danger-bg px-2.5 py-1 text-student-status-danger-fg border border-student-status-danger-border line-through">
                4 unit
              </span>
              <ArrowRight className="size-4 text-secondary-400" />
              <span className="rounded-lg bg-primary-100 px-2.5 py-1 text-primary-900 font-bold border border-primary-300">
                3 unit
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50/30 p-4 sm:flex-row sm:items-center">
            <div>
              <span className="text-xs font-bold uppercase text-secondary-500">Ambang Timeout Gateway OpenRouter</span>
              <p className="text-xs text-secondary-600">Waktu tunggu sebelum dialihkan ke model fallback</p>
            </div>
            <div className="flex items-center gap-3 font-mono text-sm">
              <span className="rounded-lg bg-student-status-danger-bg px-2.5 py-1 text-student-status-danger-fg border border-student-status-danger-border line-through">
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
            <h2 className="text-base font-extrabold text-primary-950">
              Simulasi Dampak (Berdasarkan Data 7 Hari Terakhir)
            </h2>
            <p className="mt-0.5 text-xs text-primary-800">
              Proyeksi matematis deterministik sebelum perubahan disetujui
            </p>
          </div>
          <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-bold text-primary-900 border border-primary-300">
            Model Deterministik
          </span>
        </div>

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
              <span className="text-xl font-extrabold text-warning-700">162</span>
            </div>
            <p className="mt-1 text-[11px] font-bold text-warning-700">+15% beban puncak</p>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-warning-200 bg-warning-50 p-4 text-xs text-warning-900">
          <AlertTriangle className="size-5 shrink-0 text-warning-700 mt-0.5" />
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
            <h2 className="text-base font-bold text-secondary-950">Persetujuan Ganda (Dual Approval)</h2>
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
                    <Lock className="size-4 shrink-0 text-warning-600" />
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
                    className="text-student-status-danger-fg"
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
    </div>
  );
}

function PolicyHistoryView() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-primary-100 bg-white p-6 shadow-sm">
        <div className="border-b border-primary-50 pb-4">
          <h2 className="text-base font-bold text-secondary-950">Riwayat Versi Kebijakan & Korelasi Metrik</h2>
          <p className="mt-0.5 text-xs text-secondary-500">
            Audit jejak aktivasi kebijakan yang dapat dikorelasikan langsung dengan grafik metrik keandalan
          </p>
        </div>

        {/* Version History Table */}
        <div className="mt-6 max-w-full overflow-x-auto rounded-2xl border border-primary-100">
          <Table className="min-w-[760px] text-left text-xs">
            <TableHeader className="bg-primary-50/40 font-bold text-secondary-950">
              <TableRow className="hover:bg-primary-50/40">
                <TableHead className="p-3.5">Versi</TableHead>
                <TableHead className="p-3.5">Status</TableHead>
                <TableHead className="p-3.5">Waktu Efektif</TableHead>
                <TableHead className="p-3.5">Perubahan Utama</TableHead>
                <TableHead className="p-3.5">Disetujui Oleh</TableHead>
                <TableHead className="p-3.5 text-right">Tindakan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-primary-50 text-secondary-700">
              <TableRow className="bg-primary-50/20">
                <TableCell className="p-3.5 font-bold font-mono text-secondary-950">VERA-POLICY-027</TableCell>
                <TableCell className="p-3.5">
                  <ReferenceStatusBadge label="AKTIF" size="xs" status="active" />
                </TableCell>
                <TableCell className="p-3.5">27 Aug 2026, 14:20 WIB</TableCell>
                <TableCell className="p-3.5 whitespace-normal">Penyesuaian burst 10m & quota overrun debt</TableCell>
                <TableCell className="p-3.5">Admin C</TableCell>
                <TableCell className="p-3.5 text-right">
                  <span className="text-secondary-400 font-semibold">Aktif</span>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="p-3.5 font-bold font-mono text-secondary-950">VERA-POLICY-026</TableCell>
                <TableCell className="p-3.5">
                  <ReferenceStatusBadge label="SUPERSEDED" size="xs" status="neutral" />
                </TableCell>
                <TableCell className="p-3.5">20 Aug 2026, 09:00 WIB</TableCell>
                <TableCell className="p-3.5 whitespace-normal">Inisialisasi OpenRouter free provider fallback</TableCell>
                <TableCell className="p-3.5">Admin B</TableCell>
                <TableCell className="p-3.5 text-right">
                  <Button className="min-h-[44px] text-xs text-primary-700" size="default" variant="ghost">
                    Rollback
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

type PolicyState = {
  activeTab: "active" | "editor" | "history";
  currentRevision: string;
  revisionState: PolicyLifecycleState;
  showActivationModal: boolean;
  activationMode: "immediate" | "scheduled";
  isActivating: boolean;
  actionNotice: string | null;
};

type PolicyAction =
  | { type: "SET_TAB"; tab: "active" | "editor" | "history" }
  | { type: "CREATE_DRAFT" }
  | { type: "SET_REVISION_STATE"; state: PolicyLifecycleState }
  | { type: "APPROVE" }
  | { type: "SET_MODAL_OPEN"; open: boolean }
  | { type: "SET_ACTIVATION_MODE"; mode: "immediate" | "scheduled" }
  | { type: "START_ACTIVATING" }
  | { type: "FINISH_ACTIVATING" }
  | { type: "DISMISS_NOTICE" };

function policyReducer(state: PolicyState, action: PolicyAction): PolicyState {
  switch (action.type) {
    case "SET_TAB":
      return { ...state, activeTab: action.tab };
    case "CREATE_DRAFT":
      return {
        ...state,
        activeTab: "editor",
        revisionState: "draft",
        actionNotice: "Draf revisi baru dibuat. Silakan modifikasi parameter dan jalankan validasi & simulasi dampak.",
      };
    case "SET_REVISION_STATE":
      return { ...state, revisionState: action.state };
    case "APPROVE":
      return {
        ...state,
        revisionState: "approved",
        actionNotice: "Kebijakan VERA-POLICY-028 telah disetujui oleh Admin C (Independen). Siap untuk deployment.",
      };
    case "SET_MODAL_OPEN":
      return { ...state, showActivationModal: action.open };
    case "SET_ACTIVATION_MODE":
      return { ...state, activationMode: action.mode };
    case "START_ACTIVATING":
      return { ...state, isActivating: true };
    case "FINISH_ACTIVATING":
      return {
        ...state,
        isActivating: false,
        showActivationModal: false,
        revisionState: "active",
        currentRevision: "VERA-POLICY-028",
        actionNotice: "Kebijakan VERA-POLICY-028 berhasil diaktifkan ke seluruh sistem produksi!",
      };
    case "DISMISS_NOTICE":
      return { ...state, actionNotice: null };
    default:
      return state;
  }
}

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
  const proposedRevision = "VERA-POLICY-028 (Draf Usulan)";

  const [state, dispatch] = useReducer(policyReducer, {
    activeTab: "active",
    currentRevision: "VERA-POLICY-027",
    revisionState: "pending_approval",
    showActivationModal: false,
    activationMode: "immediate",
    isActivating: false,
    actionNotice: null,
  });

  const {
    activeTab,
    currentRevision,
    revisionState,
    showActivationModal,
    activationMode,
    isActivating,
    actionNotice,
  } = state;

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
    dispatch({ type: "APPROVE" });
  }

  function handleActivate() {
    dispatch({ type: "START_ACTIVATING" });
    setTimeout(() => {
      dispatch({ type: "FINISH_ACTIVATING" });
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
              onClick={() => dispatch({ type: "CREATE_DRAFT" })}
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
          <div
            aria-live="assertive"
            className="flex items-center gap-3 rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg p-4 text-sm text-student-status-danger-fg"
            role="alert"
          >
            <AlertTriangle className="size-5 shrink-0 text-danger-600" />
            <p>{error}</p>
          </div>
        )}

        {actionNotice && (
          <div aria-live="polite" className="flex items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-900" role="status">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="size-5 shrink-0 text-primary-700" />
              <span>{actionNotice}</span>
            </div>
            <button
              onClick={() => dispatch({ type: "DISMISS_NOTICE" })}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-xs font-bold text-primary-700 transition-colors motion-reduce:transition-none hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35"
              type="button"
            >
              Tutup
            </button>
          </div>
        )}

        {isLoading && !metadata && (
          <div className="h-48 rounded-3xl bg-secondary-100 animate-pulse motion-reduce:animate-none" />
        )}

        {/* Sub Navigation */}
        <div aria-label="Tampilan kebijakan" className="flex min-w-0 flex-wrap items-center gap-2 border-b border-primary-100 pb-3 text-sm" role="tablist">
          <button
            aria-controls="policy-panel-active"
            aria-selected={activeTab === "active"}
            id="policy-tab-active"
            onClick={() => dispatch({ type: "SET_TAB", tab: "active" })}
            role="tab"
            type="button"
            className={cn(
              "inline-flex min-h-[44px] max-w-full items-center rounded-xl px-4 py-2 text-left font-bold transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35",
              activeTab === "active"
                ? "bg-voyage-deep text-white shadow-[inset_-3px_-3px_8px_color-mix(in_oklab,var(--voyage-surface)_18%,transparent),inset_3px_3px_8px_color-mix(in_oklab,var(--voyage-deep-hover)_70%,transparent)]"
                : "text-secondary-600 hover:bg-primary-50",
            )}
          >
            Kebijakan Aktif
          </button>
          <button
            aria-controls="policy-panel-editor"
            aria-selected={activeTab === "editor"}
            id="policy-tab-editor"
            onClick={() => dispatch({ type: "SET_TAB", tab: "editor" })}
            role="tab"
            type="button"
            className={cn(
              "inline-flex min-h-[44px] max-w-full items-center gap-1.5 rounded-xl px-4 py-2 text-left font-bold transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35",
              activeTab === "editor"
                ? "bg-voyage-deep text-white shadow-[inset_-3px_-3px_8px_color-mix(in_oklab,var(--voyage-surface)_18%,transparent),inset_3px_3px_8px_color-mix(in_oklab,var(--voyage-deep-hover)_70%,transparent)]"
                : "text-secondary-600 hover:bg-primary-50",
            )}
          >
            <span>Review Usulan & Diff</span>
            {revisionState === "pending_approval" && (
              <span className="size-2 rounded-full bg-warning-400 animate-pulse" />
            )}
          </button>
          <button
            aria-controls="policy-panel-history"
            aria-selected={activeTab === "history"}
            id="policy-tab-history"
            onClick={() => dispatch({ type: "SET_TAB", tab: "history" })}
            role="tab"
            type="button"
            className={cn(
              "inline-flex min-h-[44px] max-w-full items-center rounded-xl px-4 py-2 text-left font-bold transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35",
              activeTab === "history"
                ? "bg-voyage-deep text-white shadow-[inset_-3px_-3px_8px_color-mix(in_oklab,var(--voyage-surface)_18%,transparent),inset_3px_3px_8px_color-mix(in_oklab,var(--voyage-deep-hover)_70%,transparent)]"
                : "text-secondary-600 hover:bg-primary-50",
            )}
          >
            Riwayat Versi & Korelasi Metrik
          </button>
        </div>

        {/* Views */}
        <div
          aria-labelledby={`policy-tab-${activeTab}`}
          id={`policy-panel-${activeTab}`}
          role="tabpanel"
          tabIndex={0}
        >
          {activeTab === "active" && (
            <ActivePolicyView
              currentRevision={currentRevision}
              onOpenEditor={() => dispatch({ type: "SET_TAB", tab: "editor" })}
            />
          )}

          {activeTab === "editor" && (
            <PolicyEditorView
              handleApprove={handleApprove}
              proposedRevision={proposedRevision}
              revisionState={revisionState}
              setShowActivationModal={(open) => dispatch({ type: "SET_MODAL_OPEN", open })}
              setRevisionState={(state) => dispatch({ type: "SET_REVISION_STATE", state })}
            />
          )}

          {activeTab === "history" && <PolicyHistoryView />}
        </div>

        <PolicyActivationModal
          activationMode={activationMode}
          handleActivate={handleActivate}
          isActivating={isActivating}
          setActivationMode={(mode) => dispatch({ type: "SET_ACTIVATION_MODE", mode })}
          setShowActivationModal={(open) => dispatch({ type: "SET_MODAL_OPEN", open })}
          showActivationModal={showActivationModal}
        />

      </div>
    </PortalShell>
  );
}

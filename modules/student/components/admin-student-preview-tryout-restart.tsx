"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { showToast } from "@/components/ui/toast";
import { RefreshCw, ShieldCheck } from "@/lib/icons";
import type { AdminPreviewTryout } from "@/lib/admin/student-preview-tryout-reads";
import { restartAdminStudentPreviewTryoutAction } from "@/modules/admin/student-preview-actions";

const scheduleLabels: Record<AdminPreviewTryout["schedule"][number]["scheduleStatus"], string> = {
  active: "Aktif",
  archived: "Diarsipkan",
  closed: "Ditutup",
  future: "Akan datang",
};

const admissionLabels: Record<NonNullable<AdminPreviewTryout["admission"]["status"]>, string> = {
  active: "Aktif",
  pending: "Menunggu persetujuan",
  rejected: "Ditolak",
  revoked: "Dicabut",
};

const scheduleFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function formatSchedule(value: string) {
  return scheduleFormatter.format(new Date(value));
}

function RestartOverview({ tryout }: { tryout: AdminPreviewTryout }) {
  const admissionLabel = tryout.admission.status === null ? "Belum ada pendaftaran" : admissionLabels[tryout.admission.status];
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-extrabold tracking-[0.14em] text-[var(--voyage-muted-ink)] uppercase">Akses pratinjau</p><h2 className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-[var(--voyage-ink)]">Mulai ulang Tryout</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--voyage-muted-ink)]">Buat sesi pratinjau baru untuk Tryout ini. Pengerjaan, jawaban, notifikasi, dan progres siswa tidak berubah.</p></div><span className="inline-flex items-center gap-2 rounded-full bg-[var(--voyage-sea-glass-wash)] px-3 py-2 text-xs font-bold text-[var(--voyage-forest)]"><ShieldCheck className="size-4" /> Progres siswa tetap</span></div>
      <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-[var(--secondary-200)] bg-[var(--voyage-canvas)] px-4 py-3"><p className="text-xs font-bold tracking-[0.12em] text-[var(--voyage-muted-ink)] uppercase">Pendaftaran Tryout</p><p className="mt-1 text-sm font-semibold text-[var(--voyage-ink)]">{admissionLabel}</p></div><div className="rounded-2xl border border-[var(--secondary-200)] bg-[var(--voyage-canvas)] px-4 py-3"><p className="text-xs font-bold tracking-[0.12em] text-[var(--voyage-muted-ink)] uppercase">Penugasan saat ini</p><p className="mt-1 text-sm font-semibold text-[var(--voyage-ink)]">{tryout.assignments.current ? "Aktif · riwayat tersimpan" : "Belum ada"}</p></div></div>
      {tryout.assignments.current ? <div className="rounded-2xl border border-[var(--voyage-soft-border)] bg-[var(--voyage-canvas)] px-4 py-3"><p className="text-xs font-bold tracking-[0.12em] text-[var(--voyage-muted-ink)] uppercase">Penugasan saat ini</p><p className="mt-1 text-sm font-semibold text-[var(--voyage-ink)]">{tryout.assignments.current.name}</p><p className="mt-1 text-xs leading-5 text-[var(--voyage-muted-ink)]">{scheduleLabels[tryout.assignments.current.scheduleStatus]} · ditugaskan {formatSchedule(tryout.assignments.current.assignedAt)}</p></div> : null}
    </>
  );
}

function RestartSourceSessions({ sessions, sourceId, tryoutId, onSourceChange }: { sessions: AdminPreviewTryout["schedule"]; sourceId: string; tryoutId: string; onSourceChange: (id: string) => void }) {
  return (
    <div className="grid gap-2"><p className="text-xs font-bold tracking-[0.12em] text-[var(--voyage-muted-ink)] uppercase">Pilih sesi sumber</p>{sessions.length ? sessions.map((session) => <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--secondary-200)] px-4 py-3 transition has-[:checked]:border-[var(--voyage-forest)] has-[:checked]:bg-[var(--voyage-sea-glass-wash)]" key={session.id}><input checked={sourceId === session.id} className="mt-1 accent-[var(--voyage-forest)]" name={`preview-source-${tryoutId}`} onChange={() => onSourceChange(session.id)} type="radio" value={session.id} /><span className="min-w-0"><span className="block text-sm font-bold text-[var(--voyage-ink)]">{session.name}</span><span className="mt-1 block text-xs leading-5 text-[var(--voyage-muted-ink)]">{scheduleLabels[session.scheduleStatus]} · {formatSchedule(session.availableFrom)}–{formatSchedule(session.availableUntil)} WIB</span></span></label>) : <p className="rounded-2xl border border-dashed border-[var(--secondary-200)] px-4 py-4 text-sm leading-6 text-[var(--voyage-muted-ink)]">Belum ada sesi aktif atau yang sudah ditutup untuk membuat pengerjaan ulang. Sesi mendatang dan yang diarsipkan tidak dapat dipilih.</p>}</div>
  );
}

function RestartAssignmentHistory({ history }: { history: AdminPreviewTryout["assignments"]["history"] }) {
  if (!history.length) return null;
  return <div className="grid gap-2"><p className="text-xs font-bold tracking-[0.12em] text-[var(--voyage-muted-ink)] uppercase">Riwayat penugasan sebelumnya</p>{history.map((assignment) => <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--voyage-canvas)] px-4 py-3 text-sm" key={assignment.id}><span className="font-semibold text-[var(--voyage-ink)]">{assignment.name}</span><span className="text-xs font-bold text-[var(--voyage-muted-ink)]">Digantikan · {formatSchedule(assignment.assignedAt)}</span></div>)}</div>;
}

function RestartNotices({ error, reason }: { error: string | null; reason: AdminPreviewTryout["restart"]["reason"] }) {
  return <>{error ? <p className="rounded-2xl bg-[var(--danger-50)] px-4 py-3 text-sm leading-6 text-[var(--danger-700)]" role="alert">{error}</p> : null}{reason === "assignment_invariant" ? <p className="rounded-2xl bg-[var(--danger-50)] px-4 py-3 text-sm leading-6 text-[var(--danger-700)]" role="alert">Data penugasan pratinjau tidak konsisten. Mulai ulang dinonaktifkan sampai data diperbaiki. Hubungi tim teknis.</p> : reason === "admission_repair_required" ? <p className="rounded-2xl bg-[var(--warning-50)] px-4 py-3 text-sm leading-6 text-[var(--voyage-warm-sun-ink)]" role="status">Pendaftaran Tryout perlu diperbaiki sebelum pengerjaan ulang dapat dibuat. Status pendaftaran tidak berubah otomatis.</p> : null}</>;
}

function RestartConfirmationDialog({ busy, open, reason, selectedSourceId, selectedSourceName, tryoutId, onOpenChange, onReasonChange, onConfirm }: { busy: boolean; open: boolean; reason: string; selectedSourceId: string; selectedSourceName: string; tryoutId: string; onOpenChange: (open: boolean) => void; onReasonChange: (reason: string) => void; onConfirm: () => void }) {
  return <AlertDialog onOpenChange={onOpenChange} open={open}><AlertDialogContent pending={busy}><AlertDialogHeader><AlertDialogTitle>Buat pengerjaan ulang Tryout?</AlertDialogTitle><AlertDialogDescription>Sesi sumber <strong>{selectedSourceName}</strong> akan digunakan untuk membuat sesi pratinjau baru. Penugasan sebelumnya tetap tersimpan di riwayat.</AlertDialogDescription></AlertDialogHeader><Field><FieldLabel htmlFor={`preview-restart-reason-${tryoutId}`}>Alasan membuat pengerjaan ulang</FieldLabel><FieldTextarea id={`preview-restart-reason-${tryoutId}`} maxLength={500} onChange={(event) => onReasonChange(event.target.value)} placeholder="Contoh: Memeriksa tampilan Tryout setelah konten diperbarui." value={reason} /></Field><AlertDialogFooter><AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel><AlertDialogAction disabled={busy || !reason.trim() || !selectedSourceId} onClick={onConfirm}>{busy ? "Membuat pengerjaan ulang…" : "Buat pengerjaan ulang"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function AdminStudentPreviewTryoutRestart({ tryout }: { tryout: AdminPreviewTryout }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sourceId, setSourceId] = useState(tryout.restart.eligibleSourceSessionIds[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const eligibleSet = new Set(tryout.restart.eligibleSourceSessionIds);
  const sourceSessions = tryout.schedule.filter((session) => eligibleSet.has(session.id));
  const disabled = !tryout.restart.enabled || sourceSessions.length === 0;

  const handleOpenChange = (nextOpen: boolean) => {
    if (busy) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      requestIdRef.current = null;
      setReason("");
      setError(null);
    }
  };

  const handleRestart = async () => {
    if (disabled || !sourceId || !reason.trim() || busy) return;
    setBusy(true);
    setError(null);
    requestIdRef.current ??= globalThis.crypto.randomUUID();
    try {
      const result = await restartAdminStudentPreviewTryoutAction({
        expectedCurrentAssignmentId: tryout.restart.currentAssignmentId,
        reason,
        requestId: requestIdRef.current,
        sourceDeliverySessionId: sourceId,
        tryoutId: tryout.id,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setOpen(false);
      requestIdRef.current = null;
      setReason("");
      showToast(
        result.result.replayed
          ? "Permintaan sebelumnya sudah diproses. Tidak ada pengerjaan ulang tambahan yang dibuat."
          : "Pengerjaan ulang Tryout untuk pratinjau berhasil dibuat. Penugasan sebelumnya tetap tersimpan di riwayat.",
        { variant: result.result.replayed ? "info" : "success" },
      );
      router.refresh();
    } catch {
      setError("Status permintaan belum dapat dipastikan. Coba lagi; sistem akan mencegah pengerjaan ulang ganda.");
    } finally {
      setBusy(false);
    }
  };

  const selectedSourceName = sourceSessions.find((session) => session.id === sourceId)?.name ?? "—";
  return (
    <section className="grid gap-4 rounded-[2rem] border border-[var(--voyage-soft-border)] bg-white p-5 shadow-[0_24px_60px_-48px_color-mix(in_oklab,var(--voyage-forest)_50%,transparent)] md:p-6">
      <RestartOverview tryout={tryout} />
      <RestartSourceSessions onSourceChange={setSourceId} sessions={sourceSessions} sourceId={sourceId} tryoutId={tryout.id} />
      <RestartAssignmentHistory history={tryout.assignments.history} />
      <RestartNotices error={error} reason={tryout.restart.reason} />
      <Button disabled={disabled} onClick={() => setOpen(true)} variant="default"><RefreshCw data-icon="inline-start" />{disabled ? "Pengerjaan ulang belum tersedia" : "Mulai ulang Tryout"}</Button>
      <RestartConfirmationDialog busy={busy} onConfirm={() => void handleRestart()} onOpenChange={handleOpenChange} onReasonChange={setReason} open={open} reason={reason} selectedSourceId={sourceId} selectedSourceName={selectedSourceName} tryoutId={tryout.id} />
    </section>
  );
}

export { AdminStudentPreviewTryoutRestart };

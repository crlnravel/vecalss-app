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
import { RefreshCw, ShieldCheck } from "@/lib/icons";
import type { AdminPreviewTryout } from "@/lib/admin/student-preview-tryout-reads";
import { restartAdminStudentPreviewTryoutAction } from "@/modules/admin/student-preview-actions";

const scheduleLabels: Record<AdminPreviewTryout["schedule"][number]["scheduleStatus"], string> = {
  active: "Aktif",
  archived: "Arsip",
  closed: "Closed",
  future: "Akan datang",
};

function formatSchedule(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function AdminStudentPreviewTryoutRestart({ tryout }: { tryout: AdminPreviewTryout }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sourceId, setSourceId] = useState(tryout.restart.eligibleSourceSessionIds[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "error" | "success" } | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const sourceSessions = tryout.schedule.filter((session) => tryout.restart.eligibleSourceSessionIds.includes(session.id));
  const disabled = !tryout.restart.enabled || sourceSessions.length === 0;

  const handleOpenChange = (nextOpen: boolean) => {
    if (busy) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      requestIdRef.current = null;
      setReason("");
      setNotice(null);
    }
  };

  const handleRestart = async () => {
    if (disabled || !sourceId || !reason.trim() || busy) return;
    setBusy(true);
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
        setNotice({ message: result.message, tone: "error" });
        return;
      }

      setOpen(false);
      requestIdRef.current = null;
      setReason("");
      setNotice({
        message: result.result.replayed
          ? "Restart sebelumnya dikembalikan. Tidak ada retake tambahan yang dibuat."
          : "Retake preview baru berhasil dibuat. Riwayat sebelumnya tetap tersimpan.",
        tone: "success",
      });
      router.refresh();
    } catch {
      setNotice({
        message: "Restart tidak dapat dikonfirmasi. Coba lagi dengan request yang sama agar tidak dibuat retake ganda.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid gap-4 rounded-[2rem] border border-[#d6e5db] bg-white p-5 shadow-[0_24px_60px_-48px_rgba(23,107,77,0.5)] md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold tracking-[0.14em] text-[#477060] uppercase">Akses preview</p>
          <h2 className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-[#173c2d]">Restart Tryout</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5f776a]">
            Buat sesi retake khusus admin tanpa membuat attempt, jawaban, notifikasi, atau progress learner.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#eef8f1] px-3 py-2 text-xs font-bold text-[#176b4d]">
          <ShieldCheck className="size-4" /> Fixture tetap
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#e2ece5] bg-[#f7faf8] px-4 py-3">
          <p className="text-xs font-bold tracking-[0.12em] text-[#477060] uppercase">Admission</p>
          <p className="mt-1 text-sm font-semibold text-[#173c2d]">
            {tryout.admission.status === null ? "Belum ada" : tryout.admission.status === "active" ? "Active" : `${tryout.admission.status} · repair diperlukan`}
          </p>
        </div>
        <div className="rounded-2xl border border-[#e2ece5] bg-[#f7faf8] px-4 py-3">
          <p className="text-xs font-bold tracking-[0.12em] text-[#477060] uppercase">Assignment current</p>
          <p className="mt-1 text-sm font-semibold text-[#173c2d]">
            {tryout.assignments.current ? "Active · riwayat dipertahankan" : "Belum ada"}
          </p>
        </div>
      </div>

      {tryout.assignments.current ? (
        <div className="rounded-2xl border border-[#d6e5db] bg-[#f7faf8] px-4 py-3">
          <p className="text-xs font-bold tracking-[0.12em] text-[#477060] uppercase">Current assignment</p>
          <p className="mt-1 text-sm font-semibold text-[#173c2d]">{tryout.assignments.current.name}</p>
          <p className="mt-1 text-xs leading-5 text-[#5f776a]">
            {scheduleLabels[tryout.assignments.current.scheduleStatus]} · ditugaskan {formatSchedule(tryout.assignments.current.assignedAt)}
          </p>
        </div>
      ) : null}

      <div className="grid gap-2">
        <p className="text-xs font-bold tracking-[0.12em] text-[#477060] uppercase">Sesi sumber yang aman</p>
        {sourceSessions.length ? sourceSessions.map((session) => (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#e2ece5] px-4 py-3 transition has-[:checked]:border-[#176b4d] has-[:checked]:bg-[#eef8f1]" key={session.id}>
            <input
              checked={sourceId === session.id}
              className="mt-1 accent-[#176b4d]"
              name={`preview-source-${tryout.id}`}
              onChange={() => setSourceId(session.id)}
              type="radio"
              value={session.id}
            />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[#173c2d]">{session.name}</span>
              <span className="mt-1 block text-xs leading-5 text-[#5f776a]">
                {scheduleLabels[session.scheduleStatus]} · {formatSchedule(session.availableFrom)}–{formatSchedule(session.availableUntil)} WIB
              </span>
            </span>
          </label>
        )) : (
          <p className="rounded-2xl border border-dashed border-[#e2ece5] px-4 py-4 text-sm leading-6 text-[#5f776a]">
            Tidak ada sesi active/closed yang aman sebagai sumber restart. Future dan archived hanya dapat dibaca.
          </p>
        )}
      </div>

      {tryout.assignments.history.length ? (
        <div className="grid gap-2">
          <p className="text-xs font-bold tracking-[0.12em] text-[#477060] uppercase">Riwayat superseded</p>
          {tryout.assignments.history.map((assignment) => (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#f7faf8] px-4 py-3 text-sm" key={assignment.id}>
              <span className="font-semibold text-[#173c2d]">{assignment.name}</span>
              <span className="text-xs font-bold text-[#5f776a]">Superseded · {formatSchedule(assignment.assignedAt)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {notice ? (
        <p className={notice.tone === "error" ? "rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm leading-6 text-[#a63832]" : "rounded-2xl bg-[#eef8f1] px-4 py-3 text-sm leading-6 text-[#176b4d]"} role="status">
          {notice.message}
        </p>
      ) : null}

      {tryout.restart.reason === "assignment_invariant" ? (
        <p className="rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm leading-6 text-[#a63832]" role="alert">
          State assignment preview tidak konsisten. Riwayat tetap read-only dan restart dinonaktifkan sampai operations owner memperbaikinya.
        </p>
      ) : tryout.restart.reason === "admission_repair_required" ? (
        <p className="rounded-2xl bg-[#fff8e8] px-4 py-3 text-sm leading-6 text-[#925816]" role="status">
          Admission preview memerlukan repair eksplisit; restart tidak mengubah status admission secara diam-diam.
        </p>
      ) : null}

      <Button disabled={disabled} onClick={() => setOpen(true)} variant="brand">
        <RefreshCw data-icon="inline-start" />
        {disabled ? "Restart belum tersedia" : "Konfirmasi restart"}
      </Button>

      <AlertDialog onOpenChange={handleOpenChange} open={open}>
        <AlertDialogContent pending={busy}>
          <AlertDialogHeader>
            <AlertDialogTitle>Buat retake preview baru?</AlertDialogTitle>
            <AlertDialogDescription>
              Sesi sumber <strong>{sourceSessions.find((session) => session.id === sourceId)?.name ?? "—"}</strong> akan menjadi konteks publik. Sesi baru memakai default preview yang aman, sementara attempt dan assignment lama tetap menjadi history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor={`preview-restart-reason-${tryout.id}`}>Alasan audit</FieldLabel>
            <FieldTextarea
              id={`preview-restart-reason-${tryout.id}`}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Contoh: Verifikasi tampilan sesi Tryout published setelah perubahan konten."
              value={reason}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction disabled={busy || !reason.trim() || !sourceId} onClick={() => void handleRestart()}>
              {busy ? "Memproses…" : "Buat retake preview"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export { AdminStudentPreviewTryoutRestart };

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

const scheduleFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function formatSchedule(value: string) {
  return scheduleFormatter.format(new Date(value));
}

function AdminStudentPreviewTryoutRestart({ tryout }: { tryout: AdminPreviewTryout }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sourceId, setSourceId] = useState(tryout.restart.eligibleSourceSessionIds[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "error" | "success" } | null>(null);
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
    <section className="grid gap-4 rounded-[2rem] border border-[var(--voyage-soft-border)] bg-white p-5 shadow-[0_24px_60px_-48px_color-mix(in_oklab,var(--voyage-forest)_50%,transparent)] md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold tracking-[0.14em] text-[var(--voyage-muted-ink)] uppercase">Akses preview</p>
          <h2 className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-[var(--voyage-ink)]">Restart Tryout</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--voyage-muted-ink)]">
            Buat sesi retake khusus admin tanpa membuat attempt, jawaban, notifikasi, atau progress learner.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-[var(--voyage-sea-glass-wash)] px-3 py-2 text-xs font-bold text-[var(--voyage-forest)]">
          <ShieldCheck className="size-4" /> Fixture tetap
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--secondary-200)] bg-[var(--voyage-canvas)] px-4 py-3">
          <p className="text-xs font-bold tracking-[0.12em] text-[var(--voyage-muted-ink)] uppercase">Admission</p>
          <p className="mt-1 text-sm font-semibold text-[var(--voyage-ink)]">
            {tryout.admission.status === null ? "Belum ada" : tryout.admission.status === "active" ? "Active" : `${tryout.admission.status} · repair diperlukan`}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--secondary-200)] bg-[var(--voyage-canvas)] px-4 py-3">
          <p className="text-xs font-bold tracking-[0.12em] text-[var(--voyage-muted-ink)] uppercase">Assignment current</p>
          <p className="mt-1 text-sm font-semibold text-[var(--voyage-ink)]">
            {tryout.assignments.current ? "Active · riwayat dipertahankan" : "Belum ada"}
          </p>
        </div>
      </div>

      {tryout.assignments.current ? (
        <div className="rounded-2xl border border-[var(--voyage-soft-border)] bg-[var(--voyage-canvas)] px-4 py-3">
          <p className="text-xs font-bold tracking-[0.12em] text-[var(--voyage-muted-ink)] uppercase">Current assignment</p>
          <p className="mt-1 text-sm font-semibold text-[var(--voyage-ink)]">{tryout.assignments.current.name}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--voyage-muted-ink)]">
            {scheduleLabels[tryout.assignments.current.scheduleStatus]} · ditugaskan {formatSchedule(tryout.assignments.current.assignedAt)}
          </p>
        </div>
      ) : null}

      <div className="grid gap-2">
        <p className="text-xs font-bold tracking-[0.12em] text-[var(--voyage-muted-ink)] uppercase">Sesi sumber yang aman</p>
        {sourceSessions.length ? sourceSessions.map((session) => (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--secondary-200)] px-4 py-3 transition has-[:checked]:border-[var(--voyage-forest)] has-[:checked]:bg-[var(--voyage-sea-glass-wash)]" key={session.id}>
            <input
              checked={sourceId === session.id}
              className="mt-1 accent-[var(--voyage-forest)]"
              name={`preview-source-${tryout.id}`}
              onChange={() => setSourceId(session.id)}
              type="radio"
              value={session.id}
            />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[var(--voyage-ink)]">{session.name}</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--voyage-muted-ink)]">
                {scheduleLabels[session.scheduleStatus]} · {formatSchedule(session.availableFrom)}–{formatSchedule(session.availableUntil)} WIB
              </span>
            </span>
          </label>
        )) : (
          <p className="rounded-2xl border border-dashed border-[var(--secondary-200)] px-4 py-4 text-sm leading-6 text-[var(--voyage-muted-ink)]">
            Tidak ada sesi active/closed yang aman sebagai sumber restart. Future dan archived hanya dapat dibaca.
          </p>
        )}
      </div>

      {tryout.assignments.history.length ? (
        <div className="grid gap-2">
          <p className="text-xs font-bold tracking-[0.12em] text-[var(--voyage-muted-ink)] uppercase">Riwayat superseded</p>
          {tryout.assignments.history.map((assignment) => (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--voyage-canvas)] px-4 py-3 text-sm" key={assignment.id}>
              <span className="font-semibold text-[var(--voyage-ink)]">{assignment.name}</span>
              <span className="text-xs font-bold text-[var(--voyage-muted-ink)]">Superseded · {formatSchedule(assignment.assignedAt)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {notice ? (
        <p className={notice.tone === "error" ? "rounded-2xl bg-[var(--danger-50)] px-4 py-3 text-sm leading-6 text-[var(--danger-700)]" : "rounded-2xl bg-[var(--voyage-sea-glass-wash)] px-4 py-3 text-sm leading-6 text-[var(--voyage-forest)]"} role="status">
          {notice.message}
        </p>
      ) : null}

      {tryout.restart.reason === "assignment_invariant" ? (
        <p className="rounded-2xl bg-[var(--danger-50)] px-4 py-3 text-sm leading-6 text-[var(--danger-700)]" role="alert">
          State assignment preview tidak konsisten. Riwayat tetap read-only dan restart dinonaktifkan sampai operations owner memperbaikinya.
        </p>
      ) : tryout.restart.reason === "admission_repair_required" ? (
        <p className="rounded-2xl bg-[var(--warning-50)] px-4 py-3 text-sm leading-6 text-[var(--voyage-warm-sun-ink)]" role="status">
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

"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ChevronLeft } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_FIELD_LABEL_CLASS_NAME } from "@/components/dashboard/reference-dashboard-tokens";
import { showToast } from "@/components/ui/toast";
import { buildMentorTryoutOperationsHref } from "@/lib/navigation/canonical-context";
import { selectMainTryoutSession } from "@/lib/tryout/main-session";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { formatTryoutDateTime } from "@/lib/tryout/time";
import { admissionStatusLabels, assignmentStatusLabels, participantAttemptStateLabels } from "@/modules/mentor/KaptenTryoutOperationsData";
import { inviteTryoutParticipantAction, decideTryoutAdmissionAction, revokeTryoutDeliveryAssignmentAction } from "@/modules/mentor/tryout-actions";
import { refreshTryoutLiveAction } from "@/modules/mentor/tryout-operations-actions";
import { withTryoutRequestDeadline } from "@/modules/mentor/tryout-request-recovery";

function KaptenTryoutParticipantDetailPageModule({ admissionId, embedded = false, initial, backHref }: {
  admissionId: string;
  embedded?: boolean;
  initial: TryoutOperationsView;
  backHref?: string;
}) {
  const [view, setView] = useState(initial);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState<"approve" | "reject" | "assign" | "restore" | "revoke" | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [decidedStatus, setDecidedStatus] = useState<string | null>(null);
  const participant = view.participants.find((item) => item.admissionId === admissionId)!;
  const identity = participant.participant;
  const status = decidedStatus ?? participant.admission.status;
  const main = selectMainTryoutSession(view.sessions);
  const eligible = main?.grantEligible;
  const canDecide = view.status !== "archived" && status === "pending";
  const mainAssignment = participant.sessions.find((session) => session.id === main?.id);
  const canManage = view.status === "published" && ["active", "rejected", "revoked"].includes(status);
  const needsRestoration = status === "rejected" || status === "revoked" || mainAssignment?.assignmentStatus === "revoked";
  const confirmationTitle = confirmation === "approve" ? "Setujui pendaftaran" : confirmation === "reject" ? "Tolak pendaftaran" : confirmation === "revoke" ? "Cabut akses sesi" : confirmation === "restore" ? "Berikan akses lagi" : "Tugaskan sesi";

  async function refresh() {
    const result = await withTryoutRequestDeadline(refreshTryoutLiveAction(view.id));
    if (!result.ok || !result.result.participants.some((item) => item.admissionId === admissionId)) throw new Error("refresh");
    setView(result.result);
    setDecidedStatus(null);
    setRefreshFailed(false);
  }
  async function reload() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try { await refresh(); }
    catch { setRefreshFailed(true); showToast("Data peserta belum dapat diperbarui. Coba muat ulang.", { variant: "error" }); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function decide() {
    if (!confirmation || !reason.trim() || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const decision = confirmation;
    try {
      const request = decision === "revoke"
        ? revokeTryoutDeliveryAssignmentAction(revokeTarget!, reason)
        : decision === "assign" || decision === "restore"
          ? inviteTryoutParticipantAction(view.id, identity.id, reason, main!.id, decision === "restore" ? "restore" : "invite")
          : decideTryoutAdmissionAction(admissionId, decision, reason, decision === "approve" ? main?.id : undefined);
      const result = await withTryoutRequestDeadline<{ ok: true; result: { status: string } } | { ok: false; message?: string }>(request);
      if (!result.ok) {
        setConfirmation(null);
        if ("outcomeUnknown" in result && result.outcomeUnknown) {
          setRefreshFailed(true);
          showToast("Hasil tindakan belum dapat dipastikan. Muat ulang data peserta sebelum mencoba lagi.", { variant: "warning" });
          return;
        }
        showToast(result.message ?? "Keputusan belum dapat disimpan.", { variant: "error" });
        try { await refresh(); } catch { setRefreshFailed(true); }
        return;
      }
      // Retain the confirmed outcome even if the subsequent read fails.
      if (decision !== "revoke") setDecidedStatus(result.result.status);
      setConfirmation(null);
      setReason("");
      showToast(decision === "approve" ? `Pendaftaran ${identity.displayName} disetujui.` : decision === "reject" ? `Pendaftaran ${identity.displayName} ditolak.` : decision === "revoke" ? `Akses sesi ${identity.displayName} dicabut.` : `Akses sesi ${identity.displayName} diberikan.`, { variant: "success" });
      try { await refresh(); }
      catch { setRefreshFailed(true); showToast("Keputusan tersimpan. Data peserta belum diperbarui; coba muat ulang.", { variant: "warning" }); }
    } catch {
      setConfirmation(null);
      setRefreshFailed(true);
      showToast("Hasil tindakan belum dapat dipastikan. Muat ulang data peserta sebelum mencoba lagi.", { variant: "warning" });
    } finally { busyRef.current = false; setBusy(false); }
  }
  return <section className={embedded ? "grid min-w-0 gap-5" : "grid min-w-0 gap-5 px-4 py-5 sm:px-6 lg:px-8"} aria-labelledby="participant-detail-title">
    <div className="flex min-w-0 items-start gap-3">
      <Button nativeButton={false} render={<Link href={backHref ?? buildMentorTryoutOperationsHref(view.id, { delivery: "participants" })} />} aria-label="Kembali ke daftar peserta Tryout" size="icon" variant="outline"><ChevronLeft aria-hidden="true" /></Button>
      <div className="min-w-0"><h2 className="break-words text-xl font-semibold text-secondary-900" id="participant-detail-title">{identity.displayName}</h2><p className="break-all text-sm text-secondary-700">{identity.email}</p><p className="mt-1 text-sm text-secondary-600">{view.title}</p></div>
    </div>
    <ReferenceSurface className="grid gap-4 p-5 sm:grid-cols-2">
      <div><p className="text-sm text-secondary-600">Pendaftaran</p><p className="font-semibold text-secondary-900">{admissionStatusLabels[status]}</p><p className="mt-1 text-sm text-secondary-700">Diajukan {formatTryoutDateTime(participant.admission.requestedAt)} WIB</p></div>
      <div><p className="text-sm text-secondary-600">Pengerjaan</p><p className="font-semibold text-secondary-900">{participant.attempt ? participantAttemptStateLabels[participant.attempt.attemptState] : "Belum mulai"}</p></div>
      <div className="grid gap-3 sm:col-span-2"><h3 className="font-semibold text-secondary-900">Penugasan sesi</h3>{participant.sessions.length ? participant.sessions.map((session) => <div key={session.assignmentId}><p className="font-medium text-secondary-900">{session.name} · {assignmentStatusLabels[session.assignmentStatus]}</p><p className="text-sm text-secondary-600">{formatTryoutDateTime(session.availableFrom)} WIB – {formatTryoutDateTime(session.availableUntil)} WIB</p></div>) : <p className="text-sm text-secondary-600">Belum ada sesi yang ditugaskan.</p>}</div>
    </ReferenceSurface>
    {refreshFailed ? <div className="flex flex-wrap items-center gap-3"><p className="text-sm text-secondary-600">Muat ulang untuk melihat data peserta terbaru.</p><Button variant="outline" disabled={busy} onClick={() => void reload()}>{busy ? "Memuat…" : "Muat ulang data peserta"}</Button></div> : null}
    {view.status === "archived" ? <p className="text-sm text-secondary-600">Tryout sudah diarsipkan. Pendaftaran hanya dapat dilihat sebagai riwayat.</p> : null}
    {canDecide || canManage ? <ReferenceSurface className="grid gap-4 p-5">
      <h3 className="font-semibold text-secondary-900">{canDecide ? "Tinjau pendaftaran" : "Kelola akses sesi"}</h3>
      <p className="text-sm text-secondary-700">{eligible ? `Persetujuan memberi akses ke ${main.name}. Peserta dapat mulai sesuai jadwal.` : "Belum ada sesi yang siap menerima peserta. Siapkan sesi sebelum menyetujui pendaftaran."}</p>
      {eligible ? <p className="text-sm text-secondary-600">{formatTryoutDateTime(main.availableFrom)} WIB – {formatTryoutDateTime(main.availableUntil)} WIB</p> : null}
      <Field><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="participant-decision-reason" required>Alasan tindakan</FieldLabel><FieldInput id="participant-decision-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Jelaskan alasan keputusan" required aria-required="true" disabled={busy} /></Field>
      <div className="flex flex-wrap gap-3">
        {canDecide ? <><Button disabled={busy || !reason.trim() || !eligible || refreshFailed} onClick={() => setConfirmation("approve")}>Setujui</Button><Button variant="destructive" disabled={busy || !reason.trim() || refreshFailed} onClick={() => setConfirmation("reject")}>Tolak</Button></> : null}
        {canManage && (needsRestoration || mainAssignment?.assignmentStatus !== "active") ? <Button disabled={busy || !reason.trim() || !eligible || refreshFailed} onClick={() => setConfirmation(needsRestoration ? "restore" : "assign")}>{needsRestoration ? "Berikan akses lagi" : "Berikan akses sesi"}</Button> : null}
        {canManage && status === "active" ? participant.sessions.filter((session) => session.assignmentStatus === "active").map((session) => <Button key={session.assignmentId} variant="destructive" disabled={busy || !reason.trim() || refreshFailed} onClick={() => { setRevokeTarget(session.assignmentId); setConfirmation("revoke"); }}>Cabut akses {session.name}</Button>) : null}
      </div>
    </ReferenceSurface> : null}
    <AlertDialog open={confirmation !== null} onOpenChange={(open) => { if (!open && !busy) setConfirmation(null); }}>
      <AlertDialogContent variant={confirmation === "reject" || confirmation === "revoke" ? "danger" : undefined}>
        <AlertDialogHeader><AlertDialogTitle>{confirmationTitle} untuk {identity.displayName}?</AlertDialogTitle><AlertDialogDescription>{identity.email}. {confirmation === "reject" ? `Peserta tidak mendapat akses ke ${view.title}. Riwayat pendaftaran tetap tersimpan.` : confirmation === "revoke" ? `Peserta tidak dapat memulai ${participant.sessions.find((session) => session.assignmentId === revokeTarget)?.name ?? "sesi ini"}. Akses yang sudah memiliki pengerjaan tidak dapat dicabut.` : `Peserta mendapat akses ke ${main?.name ?? "sesi utama"} dan dapat mulai sesuai jadwal.`} Alasan: {reason}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel><AlertDialogAction disabled={busy} variant={confirmation === "reject" || confirmation === "revoke" ? "destructive" : "default"} onClick={(event) => { event.preventDefault(); void decide(); }}>{busy ? "Memproses…" : confirmationTitle}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
export { KaptenTryoutParticipantDetailPageModule };

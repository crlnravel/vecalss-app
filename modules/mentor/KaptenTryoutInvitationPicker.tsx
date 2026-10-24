"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_FIELD_LABEL_CLASS_NAME } from "@/components/dashboard/reference-dashboard-tokens";
import { showToast } from "@/components/ui/toast";
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
import { selectMainTryoutSession } from "@/lib/tryout/main-session";
import { tryoutAccessGrantBlockMessage } from "@/lib/tryout/registration-availability";
import { invitationIntent, invitationSearchReducer, initialInvitationSearch } from "@/lib/tryout/invitation-state";
import type { TryoutOperationsView, TryoutParticipantsView } from "@/lib/tryout/operations-view";
import { formatTryoutDateTime } from "@/lib/tryout/time";
import { inviteTryoutParticipantAction, refreshTryoutParticipantsAction, searchTryoutInvitationStudentsAction } from "@/modules/mentor/tryout-actions";
import { admissionStatusLabels } from "@/modules/mentor/KaptenTryoutOperationsData";
import { performTryoutAccess } from "@/modules/mentor/tryout-access-request";
import { withTryoutRequestDeadline } from "@/modules/mentor/tryout-request-recovery";

const searchId = "tryout-invitation-search";
const resultsId = "tryout-invitation-results";

function KaptenTryoutInvitationPicker({ onRefresh, sessions, tryoutId, participantHref }: {
  onRefresh: (view: TryoutParticipantsView) => void;
  sessions: TryoutOperationsView["sessions"];
  tryoutId: string;
  participantHref: (admissionId: string) => string;
}) {
  const [search, dispatch] = useReducer(invitationSearchReducer, initialInvitationSearch);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const [confirmation, setConfirmation] = useState(false);
  const [recovery, setRecovery] = useState<"saved" | "unknown" | null>(null);
  const main = selectMainTryoutSession(sessions);
  const intent = invitationIntent(search.selected, main?.id ?? "");
  const eligible = Boolean(main?.grantEligible);
  const actionLabel = intent === "restore" ? "Berikan akses lagi" : "Berikan akses";
  usePageStatusToast({ active: search.loading, message: "Mencari siswa…", variant: "info" });

  function clearSearch() {
    generation.current += 1;
    dispatch({ type: "clear", generation: generation.current });
  }
  function changeQuery(query: string) {
    if (busyRef.current || recovery) return;
    generation.current += 1;
    dispatch({ type: "query", query, generation: generation.current });
  }
  useEffect(() => {
    if (search.query.trim().length < 2 || search.selected || busy || recovery) return;
    const requestId = search.generation;
    const timer = window.setTimeout(() => {
      dispatch({ type: "start", generation: requestId });
      void withTryoutRequestDeadline(searchTryoutInvitationStudentsAction(tryoutId, search.query)).then((result) => {
        if (generation.current !== requestId) return;
        dispatch(result.ok ? { type: "result", generation: requestId, students: result.result } : { type: "error", generation: requestId, message: result.message });
      }).catch(() => {
        if (generation.current === requestId) dispatch({ type: "error", generation: requestId, message: "Pencarian belum dapat dimuat. Coba lagi." });
      });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [search.query, search.generation, search.selected, busy, recovery, tryoutId]);

  async function reload() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const result = await withTryoutRequestDeadline(refreshTryoutParticipantsAction(tryoutId));
      if (!result.ok) throw new Error("refresh");
      onRefresh(result.result); setRecovery(null); clearSearch(); setReason("");
    } catch { showToast("Data peserta belum dapat diperbarui. Coba muat ulang.", { variant: "error" }); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function submit() {
    if (busyRef.current || recovery || !search.selected || !main || !reason.trim() || !eligible || (intent !== "invite" && intent !== "restore")) return;
    const student = search.selected;
    busyRef.current = true; setBusy(true); setConfirmation(false);
    generation.current += 1;
    try {
      const outcome = await performTryoutAccess(
        () => inviteTryoutParticipantAction(tryoutId, student.id, reason, main.id, intent),
        () => refreshTryoutParticipantsAction(tryoutId),
      );
      if (outcome.state === "refused") { showToast(outcome.message, { variant: "error" }); return; }
      if (outcome.state === "unknown") {
        setRecovery("unknown"); showToast("Hasil tindakan belum dapat dipastikan. Muat ulang data peserta sebelum mencoba lagi.", { variant: "warning" }); return;
      }
      showToast(outcome.receipt.changed ? `Akses Tryout untuk ${student.displayName} diberikan.` : `Akses ${student.displayName} sudah aktif.`, { variant: "success" });
      if (outcome.view) { onRefresh(outcome.view); clearSearch(); setReason(""); }
      else { setRecovery("saved"); showToast("Akses tersimpan. Daftar peserta belum diperbarui; coba muat ulang.", { variant: "warning" }); }
    } finally { busyRef.current = false; setBusy(false); }
  }
  function choose(id: string) {
    if (busyRef.current || recovery) return;
    generation.current += 1;
    dispatch({ type: "choose", id, generation: generation.current });
    document.getElementById(searchId)?.focus();
  }
  return <ReferenceSurface as="section" className="grid min-w-0 gap-5 p-4 sm:p-5" aria-labelledby="tryout-invitation-title">
    <div><h3 id="tryout-invitation-title" className="text-lg font-semibold text-secondary-900">Undang peserta</h3><p className="mt-1 text-sm text-secondary-600">Pilih siswa dan beri akses langsung ke sesi utama. Siswa mendapat pemberitahuan dan dapat mulai sesuai jadwal.</p></div>
    <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      <div className="grid min-w-0 content-start gap-3">
        <Field><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={searchId}>Cari nama atau email siswa</FieldLabel><FieldInput id={searchId} role="combobox" aria-autocomplete="list" aria-controls={resultsId} aria-expanded={search.students.length > 0} aria-activedescendant={search.activeIndex >= 0 ? `${resultsId}-${search.students[search.activeIndex]?.id}` : undefined} aria-describedby={`${searchId}-hint`} className="min-h-[44px]" disabled={busy || Boolean(recovery)} value={search.query} placeholder="Ketik nama atau email…" onChange={(event) => changeQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key === "ArrowDown" && search.students.length) { event.preventDefault(); dispatch({ type: "index", index: Math.min(search.students.length - 1, search.activeIndex + 1) }); }
          else if (event.key === "ArrowUp" && search.students.length) { event.preventDefault(); dispatch({ type: "index", index: Math.max(0, search.activeIndex - 1) }); }
          else if (event.key === "Enter" && search.activeIndex >= 0 && search.students[search.activeIndex]) { event.preventDefault(); choose(search.students[search.activeIndex].id); }
          else if (event.key === "Escape") clearSearch();
        }} /><p id={`${searchId}-hint`} className="text-xs text-secondary-600">Minimal 2 karakter. Periksa email untuk membedakan siswa dengan nama yang sama.</p></Field>
        {search.error ? <div role="alert" className="text-sm text-secondary-700"><p>{search.error}</p><Button variant="outline" onClick={() => changeQuery(search.query)}>Coba pencarian lagi</Button></div> : null}
        {!search.loading && search.query.trim().length >= 2 && !search.students.length && !search.selected && !search.error ? <p className="text-sm text-secondary-600">Tidak ada siswa yang sesuai.</p> : null}
        <ul id={resultsId} role="listbox" aria-label="Hasil pencarian siswa" className="grid max-h-64 min-w-0 gap-2 overflow-y-auto">
          {search.students.map((student, index) => <li key={student.id}><Button id={`${resultsId}-${student.id}`} role="option" aria-selected={search.activeIndex === index} className="min-h-11 w-full min-w-0 justify-start whitespace-normal text-left" variant="outline" disabled={busy || Boolean(recovery)} onClick={() => choose(student.id)}><span className="min-w-0"><span className="block break-words font-semibold">{student.displayName}</span><span className="block break-all text-sm font-normal">{student.email}</span></span></Button></li>)}
        </ul>
      </div>
      <div className="grid min-w-0 content-start gap-4">
        {search.selected ? <div className="min-w-0"><p className="break-words font-semibold text-secondary-900">{search.selected.displayName}</p><p className="break-all text-sm text-secondary-700">{search.selected.email}</p><p className="mt-1 text-sm text-secondary-600">{search.selected.admission ? admissionStatusLabels[search.selected.admission.status] : "Belum terdaftar"}</p></div> : <p className="text-sm text-secondary-600">Pilih satu siswa dari hasil pencarian.</p>}
        <div><p className="font-semibold text-secondary-900">{main?.name ?? "Belum ada sesi"}</p>{main ? <p className="mt-1 text-sm text-secondary-600">{formatTryoutDateTime(main.availableFrom)} WIB – {formatTryoutDateTime(main.availableUntil)} WIB</p> : null}<p className="mt-1 text-sm text-secondary-600">{eligible ? "Akses aktif langsung. Mulai mengerjakan mengikuti jadwal sesi." : tryoutAccessGrantBlockMessage(main?.grantBlockedReason ?? "missing_session")}</p></div>
        {intent === "review" && search.selected?.admission ? <Link className="inline-flex min-h-11 items-center font-semibold text-primary-800" href={participantHref(search.selected.admission.id)}>Tinjau pendaftaran · Setujui atau Tolak</Link> : intent === "active" ? <p className="text-sm text-secondary-600">Akses ke sesi ini sudah aktif.</p> : <><Field><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="tryout-invitation-reason" required>Alasan tindakan</FieldLabel><FieldTextarea id="tryout-invitation-reason" className="min-h-24" required aria-required="true" maxLength={500} disabled={busy || Boolean(recovery)} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Jelaskan alasan pemberian akses" /></Field><Button className="min-h-11" disabled={busy || Boolean(recovery) || !eligible || !search.selected || !reason.trim()} onClick={() => setConfirmation(true)}>{busy ? "Memproses…" : actionLabel}</Button></>}
        {recovery ? <div className="grid gap-2"><p className="text-sm text-secondary-600">{recovery === "saved" ? "Akses tersimpan. Muat ulang untuk melihat daftar terbaru." : "Muat ulang data peserta untuk memastikan hasil tindakan."}</p><Button variant="outline" disabled={busy} onClick={() => void reload()}>Muat ulang data peserta</Button></div> : null}
      </div>
    </div>
    <AlertDialog open={confirmation} onOpenChange={(open) => { if (!busy) setConfirmation(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{actionLabel} untuk {search.selected?.displayName}?</AlertDialogTitle><AlertDialogDescription>{search.selected?.email}. Sesi: {main?.name}. {main ? `${formatTryoutDateTime(main.availableFrom)} WIB – ${formatTryoutDateTime(main.availableUntil)} WIB.` : ""} Akses aktif langsung dan siswa mendapat satu pemberitahuan. Alasan: {reason}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void submit(); }}>{busy ? "Memproses…" : actionLabel}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </ReferenceSurface>;
}
export { KaptenTryoutInvitationPicker };

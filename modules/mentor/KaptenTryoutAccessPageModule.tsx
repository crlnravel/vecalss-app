"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
import { showToast } from "@/components/ui/toast";
import { REFERENCE_FIELD_LABEL_CLASS_NAME } from "@/components/dashboard/reference-dashboard-tokens";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { modeLabels, type Mode } from "@/modules/mentor/KaptenTryoutOperationsData";
import { TryoutOperationsNavigation } from "@/modules/mentor/TryoutOperationsNavigation";
import { TryoutAdmissionModeField } from "@/modules/mentor/TryoutAdmissionModeField";
import { configureTryoutAdmissionAction } from "@/modules/mentor/tryout-actions";
import { refreshTryoutLiveAction } from "@/modules/mentor/tryout-operations-actions";
import { withTryoutRequestDeadline } from "@/modules/mentor/tryout-request-recovery";
import { useTryoutUnsavedNavigation } from "@/modules/mentor/use-tryout-unsaved-navigation";

export function KaptenTryoutDraftAdmissionModule({ value, onChange, onSave, onNavigate, disabled, saving, dirty }: {
  value: Mode; onChange: (mode: Mode) => void; onSave: () => Promise<boolean>; onNavigate: (href: string) => void; disabled: boolean; saving: boolean; dirty: boolean;
}) {
  useTryoutUnsavedNavigation(dirty, onNavigate);
  usePageStatusToast({ active: dirty || saving, message: saving ? "Menyimpan draf Tryout…" : "Ada perubahan draf yang belum tersimpan", variant: saving ? "info" : "warning" });
  return <section className="mt-6 grid max-w-2xl gap-5" aria-label="Akses peserta dalam draf">
    <p className="text-sm leading-6 text-secondary-700">Pilih akses sebelum Tryout diterbitkan. Pilihan ini berlaku sejak peserta pertama mendaftar.</p>
    <TryoutAdmissionModeField value={value} onChange={onChange} disabled={disabled || saving} />
    <div><Button disabled={disabled || saving} onClick={() => void onSave()}>{saving ? "Menyimpan…" : "Simpan draf"}</Button></div>
  </section>;
}

export function KaptenTryoutAccessPageModule({ initial, parentId }: { initial: TryoutOperationsView; parentId?: string }) {
  const [view, setView] = useState(initial);
  const [selected, setSelected] = useState<Mode>(initial.admissionMode);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const leavingRef = useRef(false);
  const busyRef = useRef(false);
  const locked = view.status === "archived" || view.admissionConfigurationLocked;
  const changed = selected !== view.admissionMode;
  const dirty = changed || reason.length > 0;
  useTryoutUnsavedNavigation(dirty, (href) => { setPendingHref(href); setNavigationOpen(true); });

  usePageStatusToast({ active: !locked && (dirty || busy), message: busy ? "Menyimpan akses peserta…" : "Pilihan akses belum tersimpan", variant: busy ? "info" : "warning" });
  useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => { if (!leavingRef.current) event.preventDefault(); };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [dirty]);

  async function refresh() {
    const result = await withTryoutRequestDeadline(refreshTryoutLiveAction(view.id));
    if (!result.ok) throw new Error("refresh");
    setView(result.result);
    setRefreshFailed(false);
    return result.result;
  }
  async function reload() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try { await refresh(); }
    catch { setRefreshFailed(true); showToast("Data akses belum dapat diperbarui. Coba lagi.", { variant: "error" }); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function save() {
    if (busyRef.current || locked || !changed || !reason.trim()) return;
    busyRef.current = true;
    setBusy(true);
    const modeToSave = selected;
    try {
      const result = await withTryoutRequestDeadline(configureTryoutAdmissionAction(view.id, modeToSave, reason));
      setConfirmation(false);
      if (!result.ok) {
        setPendingHref(null);
        showToast(result.message ?? "Akses peserta belum dapat disimpan.", { variant: "error" });
        try { await refresh(); } catch { setRefreshFailed(true); }
        return;
      }
      setView((current) => ({ ...current, admissionMode: result.result.admissionMode }));
      setReason("");
      showToast("Akses peserta tersimpan.", { variant: "success" });
      try { await refresh(); }
      catch { setRefreshFailed(true); showToast("Akses peserta tersimpan. Data terbaru belum dapat dimuat; coba muat ulang.", { variant: "warning" }); }
      if (pendingHref) { leavingRef.current = true; window.location.assign(pendingHref); }
    } catch {
      setConfirmation(false);
      setRefreshFailed(true);
      setPendingHref(null);
      showToast("Hasil penyimpanan belum dapat dipastikan. Muat ulang data sebelum mencoba lagi.", { variant: "warning" });
    } finally { busyRef.current = false; setBusy(false); }
  }

  return <section className="grid min-w-0 gap-6" aria-labelledby="tryout-access-title">
    <TryoutOperationsNavigation initial={view} active="policy" parentId={parentId} />
    <div className="grid max-w-2xl gap-5">
      <div><h2 id="tryout-access-title" className="text-xl font-semibold text-secondary-900">Akses peserta</h2><p className="mt-2 text-sm text-secondary-700">Akses saat ini: <strong>{modeLabels[view.admissionMode]}</strong>.</p></div>
      {locked ? <p className="text-sm leading-6 text-secondary-700">{view.status === "archived" ? "Tryout sudah diarsipkan. Pengaturan akses hanya dapat dilihat sebagai riwayat." : "Akses terkunci karena sudah ada catatan pengerjaan peserta, termasuk yang belum dimulai atau sudah selesai."}</p> : <>
        <TryoutAdmissionModeField value={selected} onChange={setSelected} disabled={busy || refreshFailed} />
        <p className="text-sm leading-6 text-secondary-700">Perubahan berlaku untuk pendaftaran baru. Pendaftaran dan penugasan yang sudah ada tetap pada statusnya. Peserta yang menunggu persetujuan tetap perlu ditinjau di Peserta.</p>
        <Field><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="tryout-access-reason" required>Alasan perubahan</FieldLabel><FieldInput id="tryout-access-reason" required disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Jelaskan alasan perubahan akses" /></Field>
        <div className="flex flex-wrap gap-3"><Button disabled={busy || refreshFailed || !changed || !reason.trim()} onClick={() => { setPendingHref(null); setConfirmation(true); }}>Simpan akses</Button>{dirty ? <Button variant="outline" disabled={busy} onClick={() => { setSelected(view.admissionMode); setReason(""); }}>Batalkan perubahan</Button> : null}</div>
      </>}
      {refreshFailed ? <div className="grid gap-3"><p className="text-sm leading-6 text-secondary-700">Muat ulang data akses terbaru sebelum menyimpan perubahan lain. Pilihan yang kamu masukkan tetap tersedia.</p><div><Button variant="outline" disabled={busy} onClick={() => void reload()}>{busy ? "Memuat…" : "Muat ulang data akses"}</Button></div></div> : null}
    </div>
    <AlertDialog open={confirmation} onOpenChange={(open) => { if (!busy) setConfirmation(open); }}>
      <AlertDialogContent data-testid="tryout-admission-confirmation" variant="warning">
        <AlertDialogHeader><AlertDialogTitle>Ubah akses {view.title}?</AlertDialogTitle><AlertDialogDescription>Akses berubah dari {modeLabels[view.admissionMode]} menjadi {modeLabels[selected]}. Pendaftaran baru mengikuti pilihan ini. Status pendaftaran dan penugasan yang sudah ada tetap tersimpan; peserta yang menunggu persetujuan tetap perlu ditinjau. Alasan: {reason}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void save(); }}>{busy ? "Menyimpan…" : "Konfirmasi perubahan"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={navigationOpen} onOpenChange={(open) => { if (!busy) setNavigationOpen(open); }}>
      <AlertDialogContent size="sm" variant="warning">
        <AlertDialogHeader><AlertDialogTitle>Simpan perubahan akses?</AlertDialogTitle><AlertDialogDescription>Pilihan akses dan alasan belum tersimpan. Simpan sebelum melanjutkan, atau keluar tanpa menyimpan.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={() => { setPendingHref(null); }}>Lanjut mengedit</AlertDialogCancel>
          <Button variant="outline" disabled={busy} onClick={() => { const href = pendingHref; setNavigationOpen(false); setSelected(view.admissionMode); setReason(""); leavingRef.current = true; if (href) window.location.assign(href); }}>Keluar tanpa menyimpan</Button>
          <AlertDialogAction disabled={busy || refreshFailed || !changed || !reason.trim()} onClick={(event) => { event.preventDefault(); setNavigationOpen(false); setConfirmation(true); }}>Simpan lalu lanjut</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}

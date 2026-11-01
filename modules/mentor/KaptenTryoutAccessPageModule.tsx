"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
import { showToast } from "@/components/ui/toast";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { modeLabels, type Mode } from "@/modules/mentor/KaptenTryoutOperationsData";
import { TryoutOperationsLayout } from "@/modules/mentor/TryoutOperationsNavigation";
import { TryoutAdmissionModeField } from "@/modules/mentor/TryoutAdmissionModeField";
import { configureTryoutAdmissionAction } from "@/modules/mentor/tryout-actions";
import { refreshTryoutLiveAction } from "@/modules/mentor/tryout-operations-actions";
import { withTryoutRequestDeadline } from "@/modules/mentor/tryout-request-recovery";
import { useTryoutUnsavedNavigation } from "@/modules/mentor/use-tryout-unsaved-navigation";

/** The access change is audited with a fixed reason; Kapten are not asked to type one. */
const ACCESS_CHANGE_REASON = "Mengubah akses peserta Tryout";

export function KaptenTryoutDraftAdmissionModule({ value, onChange, onSave, onNavigate, disabled, saving, dirty }: {
  value: Mode; onChange: (mode: Mode) => void; onSave: () => Promise<boolean>; onNavigate: (href: string) => void; disabled: boolean; saving: boolean; dirty: boolean;
}) {
  useTryoutUnsavedNavigation(dirty, onNavigate);
  usePageStatusToast({ active: dirty || saving, message: saving ? "Menyimpan draf Tryout…" : "Ada perubahan draf yang belum tersimpan", variant: saving ? "info" : "warning" });
  return <section className="grid w-full gap-5" aria-labelledby="tryout-draft-access-title">
    <h2 id="tryout-draft-access-title" className="text-lg font-semibold text-secondary-900">Akses peserta</h2>
    <TryoutAdmissionModeField value={value} onChange={onChange} disabled={disabled || saving} />
    <div><Button disabled={disabled || saving} onClick={() => void onSave()}>{saving ? "Menyimpan…" : "Simpan draf"}</Button></div>
  </section>;
}

export function KaptenTryoutAccessPageModule({ initial, parentId }: { initial: TryoutOperationsView; parentId?: string }) {
  const [view, setView] = useState(initial);
  const [selected, setSelected] = useState<Mode>(initial.admissionMode);
  const [confirmation, setConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const busyRef = useRef(false);
  const locked = view.status === "archived" || view.admissionConfigurationLocked;
  const changed = selected !== view.admissionMode;

  usePageStatusToast({ active: busy, message: "Menyimpan akses peserta…", variant: "info" });

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
    if (busyRef.current || locked || !changed) return;
    busyRef.current = true;
    setBusy(true);
    const modeToSave = selected;
    try {
      const result = await withTryoutRequestDeadline(configureTryoutAdmissionAction(view.id, modeToSave, ACCESS_CHANGE_REASON));
      setConfirmation(false);
      if (!result.ok) {
        showToast(result.message ?? "Akses peserta belum dapat disimpan.", { variant: "error" });
        try { await refresh(); } catch { setRefreshFailed(true); }
        return;
      }
      setView((current) => ({ ...current, admissionMode: result.result.admissionMode }));
      showToast("Akses peserta tersimpan.", { variant: "success" });
      try { await refresh(); }
      catch { setRefreshFailed(true); showToast("Akses peserta tersimpan. Data terbaru belum dapat dimuat; coba muat ulang.", { variant: "warning" }); }
    } catch {
      setConfirmation(false);
      setRefreshFailed(true);
      showToast("Hasil penyimpanan belum dapat dipastikan. Muat ulang data sebelum mencoba lagi.", { variant: "warning" });
    } finally { busyRef.current = false; setBusy(false); }
  }

  return <TryoutOperationsLayout initial={view} active="policy" parentId={parentId}><section className="grid min-w-0 gap-6" aria-labelledby="tryout-access-title">
    <ReferenceSurface className="grid w-full gap-5 p-5 sm:p-6">
      <h2 id="tryout-access-title" className="text-lg font-semibold text-secondary-900">Akses peserta</h2>
      {locked ? <p className="text-sm leading-6 text-secondary-700">{view.status === "archived" ? "Tryout sudah diarsipkan, jadi akses hanya bisa dilihat." : "Akses terkunci karena sudah ada pengerjaan peserta."}</p> : <>
        <TryoutAdmissionModeField value={selected} onChange={setSelected} disabled={busy || refreshFailed} />
        <div className="flex flex-wrap gap-3"><Button disabled={busy || refreshFailed || !changed} onClick={() => setConfirmation(true)}>Simpan akses</Button></div>
      </>}
      {refreshFailed ? <div className="grid gap-3"><p className="text-sm leading-6 text-secondary-700">Muat ulang data akses terbaru sebelum menyimpan perubahan lain. Pilihan yang kamu masukkan tetap tersedia.</p><div><Button variant="outline" disabled={busy} onClick={() => void reload()}>{busy ? "Memuat…" : "Muat ulang data akses"}</Button></div></div> : null}
    </ReferenceSurface>
    <AlertDialog open={confirmation} onOpenChange={(open) => { if (!busy) setConfirmation(open); }}>
      <AlertDialogContent data-testid="tryout-admission-confirmation" variant="warning">
        <AlertDialogHeader><AlertDialogTitle>Ubah akses {view.title}?</AlertDialogTitle><AlertDialogDescription>Akses berubah dari {modeLabels[view.admissionMode]} menjadi {modeLabels[selected]}. Pendaftaran baru mengikuti pilihan ini. Status pendaftaran dan penugasan yang sudah ada tetap tersimpan; peserta yang menunggu persetujuan tetap perlu ditinjau.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void save(); }}>{busy ? "Menyimpan…" : "Konfirmasi perubahan"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section></TryoutOperationsLayout>;
}

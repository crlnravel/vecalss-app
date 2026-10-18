"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
import { showToast } from "@/components/ui/toast";
import { REFERENCE_FIELD_LABEL_CLASS_NAME } from "@/components/dashboard/reference-dashboard-tokens";
import { OptionSet } from "@/modules/mentor/KaptenTryoutOperationalShared";
import { configureTryoutResultPolicyAction } from "@/modules/mentor/tryout-result-policy-action";
import { useTryoutPolicyRecovery } from "@/modules/mentor/use-tryout-policy-recovery";
import { useTryoutUnsavedNavigation } from "@/modules/mentor/use-tryout-unsaved-navigation";
import { TRYOUT_RESULT_NAVIGATION_EVENT } from "@/modules/mentor/tryout-result-navigation";
import type { TryoutSessionReadiness, TryoutDefaultResultPolicy } from "@/lib/tryout/result-readiness";

export const resultPolicyLabels: Record<string, string> = { immediate: "Setelah semua skor siap", manual: "Dirilis oleh Kapten", automatic_at_end: "Setelah sesi berakhir", scheduled: "Sesuai jadwal" };
const options = [
  { value: "immediate" as const, label: resultPolicyLabels.immediate, description: "Hasil terbuka setelah seluruh pengerjaan yang disertakan selesai dihitung." },
  { value: "manual" as const, label: resultPolicyLabels.manual, description: "Kapten merilis hasil setelah sesi berakhir dan seluruh hasil siap." },
  { value: "automatic_at_end" as const, label: resultPolicyLabels.automatic_at_end, description: "Hasil terbuka setelah waktu selesai dan seluruh hasil siap." },
];
const notify = (message: string, saved: boolean) => showToast(message, { variant: saved ? "success" : "error" });
const navigate = (href: string) => window.location.assign(href);

/** Actual Hasil policy form; retained intent and navigation belong to this mounted scope. */
export function TryoutResultPolicyForm({ initial, refresh }: { initial: TryoutSessionReadiness; refresh: () => Promise<void> }) {
  const [selected, setSelected] = useState<TryoutDefaultResultPolicy>(initial.policy.value as TryoutDefaultResultPolicy);
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const navigationIntent = useRef<{ href: string } | null>(null);
  const leaving = useRef(false);
  const flow = useTryoutPolicyRecovery({ scope: initial.scope, write: configureTryoutResultPolicyAction, refresh, notify });
  const { state } = flow;
  const saved = state.phase === "saved";
  const busy = state.phase === "writing" || state.phase === "reading";
  const needsRefresh = state.phase === "refused";
  const retained = state.intent !== null && (!saved || state.writePending);
  const dirty = !saved && (selected !== initial.policy.value || reason.length > 0);
  const guard = dirty || retained;
  const requestNavigation = (href: string) => { navigationIntent.current = { href }; setPendingHref(href); };
  const cancelNavigation = () => { navigationIntent.current = null; setPendingHref(null); };
  useEffect(() => () => { navigationIntent.current = null; }, []);
  useTryoutUnsavedNavigation(guard, requestNavigation);
  usePageStatusToast({ active: guard || busy, message: busy ? "Menyimpan atau memeriksa aturan rilis…" : retained ? "Penyimpanan aturan rilis perlu diperiksa" : "Perubahan aturan rilis belum tersimpan", variant: busy ? "info" : "warning" });
  useEffect(() => {
    if (!guard) return;
    const unload = (event: BeforeUnloadEvent) => { if (!leaving.current) { event.preventDefault(); event.returnValue = ""; } };
    const requested = (event: Event) => { event.preventDefault(); requestNavigation((event as Event & { href: string }).href); };
    window.addEventListener("beforeunload", unload);
    window.addEventListener(TRYOUT_RESULT_NAVIGATION_EVENT, requested);
    return () => { window.removeEventListener("beforeunload", unload); window.removeEventListener(TRYOUT_RESULT_NAVIGATION_EVENT, requested); };
  }, [guard]);
  const clear = () => { flow.reset(); setSelected(initial.policy.value as TryoutDefaultResultPolicy); setReason(""); setInvalid(false); };
  const leave = (href: string, persisted = false) => {
    cancelNavigation();
    try { leaving.current = true; navigate(href); }
    catch { leaving.current = false; notify(persisted ? "Aturan rilis tersimpan, tetapi halaman tujuan belum dapat dibuka. Coba buka kembali." : "Halaman tujuan belum dapat dibuka. Pilihan tetap tersedia.", persisted); }
  };
  async function save() {
    if (!initial.policy.editable || busy || retained || needsRefresh || flow.refreshFailed) return;
    if (!reason.trim()) { setInvalid(true); return; }
    const navigation = navigationIntent.current;
    const committed = await flow.submit({ policy: selected, reason, expectedBaseline: initial.policy.baseline });
    if (committed) { setReason(""); if (navigation && navigationIntent.current === navigation) leave(navigation.href, true); }
  }
  const receipt = state.receipt ?? initial.policy.receipt;
  return <section aria-labelledby="result-policy-title" className="grid min-w-0 gap-4 border-t border-primary-100 pt-5">
    <div><h3 className="text-lg font-semibold text-secondary-900" id="result-policy-title">Aturan rilis hasil</h3><p className="mt-1 text-sm leading-6 text-secondary-700">Aturan bawaan berlaku untuk sesi yang mengikuti pengaturan Tryout. Sesi dengan aturan sendiri tetap memakai pilihannya.</p></div>
    <ul className="grid gap-1 text-sm leading-6 text-secondary-700">{initial.policy.sessions.map((session) => <li key={session.id}>{session.name}: {session.inherited ? "mengikuti aturan Tryout" : `aturan sesi sendiri · ${resultPolicyLabels[session.effectivePolicy] ?? "Belum tersedia"}`}</li>)}</ul>
    {receipt ? <p className="break-words text-sm leading-6 text-secondary-600">{state.receipt ? "Penyimpanan ini tercatat" : "Perubahan terakhir tercatat"} {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(receipt.configuredAt))}. Alasan: {receipt.reason}</p> : null}
    {saved && receipt?.policy !== initial.policy.value ? <p className="text-sm leading-6 text-secondary-700">Aturan terbaru: {resultPolicyLabels[initial.policy.value] ?? "Belum tersedia"}. Penyimpanan ini tetap tercatat.</p> : null}
    {!initial.policy.editable ? <p className="text-sm leading-6 text-secondary-700">{initial.policy.reason}</p> : <form className="grid min-w-0 max-w-2xl gap-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <OptionSet label="Aturan bawaan Tryout" required value={saved ? initial.policy.value as TryoutDefaultResultPolicy : selected} onValueChange={(value) => { flow.reset(); setSelected(value); }} options={options.map((option) => ({ ...option, disabled: busy || retained || flow.refreshFailed }))} />
      <Field data-invalid={invalid || undefined}><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="result-policy-reason" required>Alasan perubahan</FieldLabel><FieldInput id="result-policy-reason" aria-invalid={invalid || undefined} aria-describedby={invalid ? "result-policy-reason-error" : undefined} required disabled={busy || retained || flow.refreshFailed} value={reason} onChange={(event) => { if (saved) setSelected(initial.policy.value as TryoutDefaultResultPolicy); flow.reset(); setReason(event.target.value); if (event.target.value.trim()) setInvalid(false); }} /><FieldError id="result-policy-reason-error" error={invalid ? "Isi alasan perubahan terlebih dahulu." : undefined} /></Field>
      <div className="flex flex-wrap gap-2"><Button className="min-h-11" type="submit" disabled={busy || retained || needsRefresh || flow.refreshFailed || !dirty}>{state.phase === "writing" ? "Menyimpan…" : "Simpan aturan rilis"}</Button>{dirty && !retained ? <Button className="min-h-11" type="button" variant="outline" disabled={busy} onClick={clear}>Batalkan perubahan</Button> : null}</div>
    </form>}
    {needsRefresh ? <div className="grid gap-2 text-sm leading-6"><p>{state.message}</p><Button variant="outline" onClick={() => void flow.refreshRefused()}>Muat aturan terbaru</Button></div> : null}
    {retained ? <section aria-label="Pemulihan penyimpanan aturan rilis" className="grid gap-3 text-sm leading-6"><p>{state.message ?? "Tunggu hasil penyimpanan, lalu periksa status jika diperlukan."}</p><div className="flex flex-wrap gap-2"><Button className="min-h-11" disabled={busy} variant="outline" onClick={() => void flow.inspect()}>{state.phase === "reading" ? "Memeriksa…" : "Periksa status penyimpanan"}</Button>{state.phase === "retry" ? <Button className="min-h-11" disabled={busy || state.writePending} onClick={() => void flow.replay()}>Kirim ulang perubahan yang sama</Button> : null}</div></section> : null}
    {flow.refreshFailed ? <div className="grid gap-2 text-sm leading-6"><p>Aturan rilis sudah tersimpan. Tampilan terbaru belum dapat dimuat.</p><Button className="min-h-11" variant="outline" onClick={() => void flow.reload()}>Muat ulang tampilan</Button></div> : null}
    <AlertDialog open={pendingHref !== null} onOpenChange={(open) => { if (!open) cancelNavigation(); }}>
      <AlertDialogContent size="sm" variant="warning"><AlertDialogHeader><AlertDialogTitle>{saved ? "Lanjut ke halaman tujuan?" : "Simpan perubahan aturan rilis?"}</AlertDialogTitle><AlertDialogDescription>{saved ? "Aturan rilis sudah tersimpan. Lanjutkan ke halaman tujuan atau tetap di sini." : retained ? "Penyimpanan sebelumnya belum dapat dipastikan. Periksa status sebelum mengirim ulang. Keluar dari halaman tidak membatalkan penyimpanan tersebut." : "Pilihan dan alasan belum tersimpan. Simpan sebelum melanjutkan, atau keluar tanpa menyimpan."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter>
        <AlertDialogCancel>{saved ? "Tetap di sini" : "Lanjut mengedit"}</AlertDialogCancel><Button variant="outline" onClick={() => { const href = pendingHref; if (href) leave(href, saved); }}>{saved ? "Buka halaman tujuan" : retained ? "Keluar dari halaman" : "Keluar tanpa menyimpan"}</Button>{!saved ? <Button disabled={busy || retained || needsRefresh || !initial.policy.editable || !reason.trim() || flow.refreshFailed} onClick={() => void save()}>Simpan lalu lanjut</Button> : null}
      </AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </section>;
}

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";
import { AlertDialog, AlertDialogTrigger, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { showToast } from "@/components/ui/toast";
import { REFERENCE_FIELD_LABEL_CLASS_NAME } from "@/components/dashboard/reference-dashboard-tokens";
import { formatTryoutDateTime } from "@/lib/tryout/time";
import type { TryoutSessionReadiness } from "@/lib/tryout/result-readiness";
import { publishTryoutSessionResultsAction } from "@/modules/mentor/tryout-result-publication-action";
import { useTryoutPublicationRecovery } from "@/modules/mentor/use-tryout-publication-recovery";

const notify = (message: string, saved: boolean) => showToast(message, { variant: saved ? "success" : "error" });

/** Result maintenance is separate from archived authoring/operations permissions. */
export function TryoutResultPublication({ initial, tryoutTitle, available = false, refresh }: { initial: TryoutSessionReadiness; tryoutTitle: string; available?: boolean; refresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState(false);
  const mounted = useRef(false);
  const freshDispatch = useRef(false);
  const dialog = useRef({ open: false, generation: 0 });
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useLayoutEffect(() => {
    freshDispatch.current = available && initial.ready && initial.effectivePolicy === "manual" && !initial.publication;
    return () => { freshDispatch.current = false; };
  }, [available, initial.ready, initial.effectivePolicy, initial.publication]);
  const flow = useTryoutPublicationRecovery({ scope: initial.scope, write: publishTryoutSessionResultsAction, refresh, notify });
  const { state } = flow;
  const receipt = state.receipt ?? initial.publication?.receipt;
  const busy = state.phase === "writing" || state.phase === "reading";
  const retained = state.intent !== null && state.phase !== "saved";
  const dialogGeneration = dialog.current.generation;
  function changeOpen(next: boolean) {
    if (!mounted.current || dialog.current.generation !== dialogGeneration) return;
    dialog.current = { open: next, generation: dialog.current.generation + 1 };
    if (!next) flow.dismiss();
    setOpen(next);
  }
  async function save() {
    if (!mounted.current || !dialog.current.open || dialog.current.generation !== dialogGeneration || !freshDispatch.current || busy || retained || receipt) return;
    if (!reason.trim()) { setInvalid(true); return; }
    const saved = await flow.submit(reason);
    if (saved && mounted.current && dialog.current.open && dialog.current.generation === dialogGeneration) changeOpen(false);
  }
  // Freshness gates new writes, never access to a retained intent or receipt.
  if (initial.effectivePolicy !== "manual" && !receipt && !retained) return null;
  return <section aria-label="Rilis hasil sesi" className="grid min-w-0 gap-3">
    {receipt ? <dl className="grid min-w-0 gap-2 text-sm leading-6"><div><dt className="font-semibold text-secondary-900">Catatan rilis</dt><dd className="break-words text-secondary-700">{receipt.participantCount} peserta · {receipt.actorName ?? "Kapten"} · {formatTryoutDateTime(receipt.releasedAt)} WIB</dd></div><div><dt className="text-secondary-600">Alasan rilis</dt><dd className="break-words text-secondary-700">{receipt.reason}</dd></div></dl> : null}
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger render={<Button className="min-h-11 w-fit max-w-full whitespace-normal" disabled={!receipt && !retained && (!available || !initial.ready || Boolean(initial.publication))} />}>{receipt ? "Lihat catatan rilis" : retained ? "Lanjutkan pemeriksaan rilis" : "Rilis hasil sesi"}</AlertDialogTrigger>
      <AlertDialogContent pending={busy} className="min-w-0 break-words" variant="warning">
        <AlertDialogHeader><AlertDialogTitle>{receipt ? "Hasil sesi sudah dirilis" : "Rilis hasil sesi?"}</AlertDialogTitle><AlertDialogDescription><span className="block break-words font-semibold">{tryoutTitle} · {initial.sessionName}</span><span className="mt-2 block">{receipt?.participantCount ?? initial.counts.candidates} peserta akan dapat melihat seluruh skor, ulasan jawaban, pembahasan, peringkat, dan laporan. Hasil yang sudah dirilis tidak dapat ditarik kembali.</span></AlertDialogDescription></AlertDialogHeader>
        {receipt ? <p className="break-words text-sm leading-6">Dirilis oleh {receipt.actorName ?? "Kapten"} pada {formatTryoutDateTime(receipt.releasedAt)} WIB. Alasan: {receipt.reason}</p> : <form className="grid min-w-0 gap-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <Field data-invalid={invalid || undefined}><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="result-publication-reason" required>Alasan rilis</FieldLabel><FieldInput id="result-publication-reason" required aria-invalid={invalid || undefined} aria-describedby={invalid ? "result-publication-reason-error" : undefined} disabled={busy || retained} value={reason} onChange={(event) => { setReason(event.target.value); if (event.target.value.trim()) setInvalid(false); }} /><FieldError id="result-publication-reason-error" error={invalid ? "Isi alasan rilis terlebih dahulu." : undefined} /></Field>
          {state.phase === "refused" ? <p className="break-words text-sm leading-6">{state.message} Alasan Anda tetap tersedia.</p> : null}
          <AlertDialogFooter><AlertDialogCancel className="min-h-11" onClick={() => changeOpen(false)}>Batalkan</AlertDialogCancel><Button className="min-h-11 whitespace-normal" type="submit" disabled={busy || retained || !available || !initial.ready}>{state.phase === "writing" ? "Merilis…" : "Rilis seluruh hasil"}</Button></AlertDialogFooter>
        </form>}
        {retained ? <section aria-label="Pemeriksaan rilis hasil" className="grid min-w-0 gap-3 text-sm leading-6"><p>{state.message ?? "Rilis sedang diproses. Jika jawaban belum tiba, periksa status sesi sebelum mencoba lagi."}</p><div className="flex flex-wrap gap-2"><Button className="min-h-11 whitespace-normal" variant="outline" disabled={busy} onClick={() => void flow.inspect()}>{state.phase === "reading" ? "Memeriksa…" : "Periksa status rilis"}</Button>{state.phase === "retry" ? <Button className="min-h-11 whitespace-normal" disabled={busy || state.writePending} onClick={() => void flow.replay()}>Kirim ulang rilis yang sama</Button> : null}</div></section> : null}
        {flow.refreshFailed ? <section className="grid gap-2 text-sm leading-6"><p>Hasil sudah dirilis. Tampilan terbaru belum dapat dimuat.</p><Button className="min-h-11" variant="outline" onClick={() => void flow.reload()}>Muat ulang tampilan</Button></section> : null}
        {receipt || retained ? <AlertDialogFooter><AlertDialogCancel className="min-h-11" onClick={() => changeOpen(false)}>Tutup</AlertDialogCancel></AlertDialogFooter> : null}
      </AlertDialogContent>
    </AlertDialog>
    {retained && !open ? <p className="text-sm leading-6 text-secondary-700">Rilis perlu diperiksa. Alasan dan sesi tetap tersimpan selama halaman ini terbuka.</p> : null}
    {flow.refreshFailed && !open ? <div className="grid gap-2 text-sm leading-6"><p>Hasil sudah dirilis. Muat tampilan terbaru untuk melihat catatannya.</p><Button className="min-h-11 w-fit" variant="outline" onClick={() => void flow.reload()}>Muat ulang tampilan</Button></div> : null}
  </section>;
}

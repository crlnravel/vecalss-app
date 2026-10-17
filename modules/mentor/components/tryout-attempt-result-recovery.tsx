"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";
import { showToast } from "@/components/ui/toast";
import { REFERENCE_CONTROL_CLASS_NAMES, REFERENCE_FIELD_LABEL_CLASS_NAME, REFERENCE_SURFACE_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import type { TryoutCalculationIntent, TryoutResultRecoverySnapshot } from "@/lib/tryout/result-recovery";
import { calculateTryoutAttemptAction } from "@/modules/mentor/tryout-actions";
import { useTryoutCalculationRecovery } from "@/modules/mentor/use-tryout-calculation-recovery";
import { cn } from "@/lib/utils";

const write = (intent: TryoutCalculationIntent) => calculateTryoutAttemptAction(intent.attemptId, intent.reason, { attemptId: intent.attemptId, tryoutId: intent.tryoutId, sessionId: intent.sessionId });
const notify = (message: string, saved: boolean) => showToast(message, { variant: saved ? "success" : "error" });

export function TryoutAttemptResultRecovery({ initial, refresh }: { initial: TryoutResultRecoverySnapshot; refresh: () => void | Promise<void> }) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const flow = useTryoutCalculationRecovery({ scope: initial.scope, write, refresh, notify });
  const { state } = flow;
  const busy = state.phase === "writing" || state.phase === "reading";
  const retained = state.intent !== null;
  const receipt = state.receipt ?? initial.receipt;
  const available = initial.state === "ready" && state.phase !== "saved";
  const calculated = initial.state === "calculated" || state.phase === "saved";
  const unresolved = ["unknown", "retry", "blocked"].includes(state.phase);
  return (
    <Card className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "min-w-0 ring-0")}>
      <CardHeader><CardTitle className="text-lg font-semibold">Perhitungan hasil</CardTitle><CardDescription>{calculated ? "Rincian perhitungan terakhir dan alasan pencatatannya." : initial.message}</CardDescription></CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        {receipt ? <div className="min-w-0 text-sm leading-6"><p>Perhitungan tercatat {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(receipt.calculatedAt))}.</p><p className="break-words">Alasan: {receipt.reason}</p></div> : null}
        {initial.sections.some((section) => !section.ready) ? <ul className="grid gap-2 text-sm leading-6">{initial.sections.filter((section) => !section.ready).map((section) => <li key={section.sequenceNo}>Tes {section.sequenceNo}: {section.message}</li>)}</ul> : null}
        {available ? <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (!reason.trim()) { setReasonError(true); return; } void flow.submit(reason); }}>
          <Field data-invalid={reasonError || undefined}><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="result-calculation-reason" required>Alasan perhitungan</FieldLabel><FieldInput aria-describedby={reasonError ? "result-calculation-reason-error" : undefined} aria-invalid={reasonError || undefined} aria-required="true" className={REFERENCE_CONTROL_CLASS_NAMES.input} disabled={retained || busy} id="result-calculation-reason" onChange={(event) => { setReason(event.target.value); if (event.target.value.trim()) setReasonError(false); }} required value={reason} /><FieldError error={reasonError ? "Isi alasan perhitungan terlebih dahulu." : undefined} id="result-calculation-reason-error" /></Field>
          <Button className="min-h-11" disabled={retained || busy} type="submit">{state.phase === "writing" ? "Menghitung…" : "Pulihkan dan hitung skor"}</Button>
        </form> : null}
        {unresolved || state.phase === "reading" ? <section aria-label="Pemulihan perhitungan" className="grid gap-3 text-sm leading-6"><p>{state.message ?? "Periksa status perhitungan yang dikirim."}</p><div className="flex flex-wrap gap-2"><Button className="min-h-11" disabled={busy} onClick={() => void flow.inspect()} variant="outline">{state.phase === "reading" ? "Memeriksa…" : "Periksa status"}</Button>{state.phase === "retry" ? <Button className="min-h-11" disabled={busy || state.writePending} onClick={() => void flow.replay()}>Kirim ulang perhitungan yang sama</Button> : null}</div></section> : null}
        {calculated || flow.refreshFailed ? <Button className="min-h-11" onClick={() => void flow.reload()} variant="outline">Muat ulang tampilan</Button> : null}
      </CardContent>
    </Card>
  );
}

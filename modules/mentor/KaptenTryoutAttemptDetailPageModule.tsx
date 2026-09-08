"use client";

import Link from "next/link";
import { Calculator, ChevronLeft, RotateCcw, ShieldAlert } from "@/lib/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ReferencePageHeader, ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
  REFERENCE_SURFACE_CLASS_NAMES,
} from "@/components/dashboard/reference-dashboard-tokens";
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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { buildMentorTryoutOperationsHref } from "@/lib/navigation/canonical-context";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutOperationsModule";
import {
  AssessmentReleaseNotice,
  OperationNotice,
} from "@/modules/mentor/KaptenTryoutOperationalShared";
import {
  calculateTryoutAttemptAction,
  reconcileTryoutDisconnectAction,
  retryCatTestRunAction,
  startTryoutDisconnectAction,
  voidCatTestRunAction,
} from "@/modules/mentor/tryout-actions";

const timestampFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function formatTimestamp(value: string | null) {
  if (!value) return null;
  return timestampFormatter.format(new Date(value));
}

type AttemptRecord = TryoutOperationsView["sessions"][number]["attempts"][number];
type AttemptRun = AttemptRecord["runs"][number];

function AttemptRunCard({ auditReason, busy, onRetry, onVoid, run }: { auditReason: string; busy: string | null; onRetry: (runId: string) => void; onVoid: (runId: string) => void; run: AttemptRun }) {
  const canAct = run.catState !== "not_applicable" && run.catState !== "voided";
  return (
    <Card className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "ring-0")} size="sm">
      <CardHeader><CardTitle className="font-semibold">Test {run.sequenceNo}</CardTitle><CardDescription>CAT {run.catState} · {run.integrityEvents} sinyal integritas</CardDescription><CardAction><StatusBadge status={run.status} /></CardAction></CardHeader>
      {canAct ? <CardContent className="flex flex-wrap gap-2"><>{run.catState === "failed" ? <Button disabled={!auditReason.trim() || Boolean(busy)} onClick={() => onRetry(run.id)} size="sm" variant="brandOutline"><RotateCcw data-icon="inline-start" />{busy === `retry-${run.id}` ? "Memproses…" : "Coba lagi CAT"}</Button> : null}<Button disabled={!auditReason.trim() || Boolean(busy)} onClick={() => onVoid(run.id)} size="sm" variant="destructive"><ShieldAlert data-icon="inline-start" />Void CAT</Button></></CardContent> : null}
    </Card>
  );
}

function AttemptRunsSection({ attempt, auditReason, busy, onRetry, onVoid }: { attempt: AttemptRecord; auditReason: string; busy: string | null; onRetry: (runId: string) => void; onVoid: (runId: string) => void }) {
  return (
    <section aria-labelledby="attempt-runs-title" className="grid content-start gap-3">
      <div className="flex items-center justify-between gap-3"><h2 id="attempt-runs-title" className="text-xl font-semibold">Tujuh Test</h2><span className="text-sm font-medium text-secondary-700">Indeks internal 0–100 {attempt.score !== null ? Number(attempt.score).toFixed(2) : "belum dihitung"}</span></div>
      {attempt.runs.map((run) => <AttemptRunCard auditReason={auditReason} busy={busy} key={run.id} onRetry={onRetry} onVoid={onVoid} run={run} />)}
    </section>
  );
}

function AttemptDisconnectStatus({ activeRun, attempt, auditReason, busy, onReconcile, onStart }: { activeRun: AttemptRun | null; attempt: AttemptRecord; auditReason: string; busy: string | null; onReconcile: () => void; onStart: () => void }) {
  return (
    <ReferenceSurface className="grid gap-3 p-4" role="status" variant="inset">
      <div><p className="font-semibold text-secondary-900">Lifecycle disconnect</p><p className="mt-1 text-xs leading-5 text-secondary-600">Marker hanya berubah lewat perintah server berwenang. Fokus, fullscreen, timer, dan sinyal browser tidak memulai disconnect.</p></div>
      {attempt.disconnectStartedAt ? <div className="text-sm leading-6 text-secondary-700"><p>Dimulai {formatTimestamp(attempt.disconnectStartedAt)}</p>{attempt.reconciledAt ? <p>Direkonsiliasi {formatTimestamp(attempt.reconciledAt)} · total {attempt.totalDisconnectSeconds} detik</p> : <p className="font-medium text-[var(--voyage-warm-sun-ink)]">Menunggu reconcile operator.</p>}</div> : <p className="text-sm text-secondary-600">Belum ada marker disconnect.</p>}
      <div className="flex flex-wrap gap-2">{!attempt.disconnectStartedAt ? <Button disabled={!activeRun || !auditReason.trim() || Boolean(busy)} onClick={onStart} size="sm" variant="brandOutline"><ShieldAlert data-icon="inline-start" />{busy === "disconnect-start" ? "Memulai…" : "Mulai disconnect"}</Button> : !attempt.reconciledAt ? <Button disabled={!activeRun || !auditReason.trim() || Boolean(busy)} onClick={onReconcile} size="sm" variant="brandOutline"><ShieldAlert data-icon="inline-start" />{busy === "disconnect-reconcile" ? "Merekonsiliasi…" : "Rekonsiliasi disconnect"}</Button> : null}</div>
    </ReferenceSurface>
  );
}

function AttemptActionPanel({ activeRun, attempt, auditReason, busy, onAuditReasonChange, onCalculate, onDisconnectReconcile, onDisconnectStart }: { activeRun: AttemptRun | null; attempt: AttemptRecord; auditReason: string; busy: string | null; onAuditReasonChange: (value: string) => void; onCalculate: () => void; onDisconnectReconcile: () => void; onDisconnectStart: () => void }) {
  return (
    <aside><Card className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "ring-0")}><CardHeader><CardTitle className="text-lg font-semibold">Tindakan attempt</CardTitle></CardHeader><CardContent className="grid gap-4"><Field><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="attempt-audit-reason">Alasan audit</FieldLabel><FieldInput className={REFERENCE_CONTROL_CLASS_NAMES.input} id="attempt-audit-reason" onChange={(event) => onAuditReasonChange(event.target.value)} placeholder="Jelaskan alasan tindakan" value={auditReason} /></Field><Button disabled={!auditReason.trim() || Boolean(busy)} onClick={onCalculate} variant="brand"><Calculator data-icon="inline-start" />{busy === "calculate" ? "Menghitung…" : "Hitung hasil"}</Button><AttemptDisconnectStatus activeRun={activeRun} attempt={attempt} auditReason={auditReason} busy={busy} onReconcile={onDisconnectReconcile} onStart={onDisconnectStart} /></CardContent></Card></aside>
  );
}

function AttemptVoidDialog({ busy, onConfirm, onOpenChange, open }: { busy: string | null; onConfirm: () => void; onOpenChange: (open: boolean) => void; open: boolean }) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}><AlertDialogContent variant="danger"><AlertDialogHeader><AlertDialogTitle>Void run CAT?</AlertDialogTitle><AlertDialogDescription>Run dikeluarkan dari perhitungan dan dapat memblokir rilis hasil.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={Boolean(busy)}>Batal</AlertDialogCancel><AlertDialogAction disabled={Boolean(busy)} onClick={(event) => { event.preventDefault(); onConfirm(); }} variant="destructive">{busy ? "Memproses…" : "Void CAT"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  );
}

function KaptenTryoutAttemptDetailPageModule({
  backHref,
  attemptId,
  initial,
}: {
  attemptId: string;
  backHref?: string;
  initial: TryoutOperationsView;
}) {
  const router = useRouter();
  const delivery = initial.sessions.find((session) =>
    session.attempts.some((attempt) => attempt.id === attemptId),
  )!;
  const attempt = delivery.attempts.find((item) => item.id === attemptId)!;
  const activeRun = attempt.runs.find((run) => run.status === "active") ?? null;
  const [auditReason, setAuditReason] = useState("");
  const [voidRunId, setVoidRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const report = (message: string, result: { ok: boolean; message?: string }) => {
    setBusy(null);
    if (!result.ok) {
      setNotice(result.message ?? "Tindakan attempt tidak dapat diproses.");
      return;
    }
    setAuditReason("");
    setNotice(message);
    router.refresh();
  };

  const handleCalculate = async () => {
    if (!auditReason.trim()) return;
    setBusy("calculate");
    report(
      "Hasil attempt berhasil dihitung.",
      await calculateTryoutAttemptAction(attempt.id, auditReason),
    );
  };

  const handleRetry = async (runId: string) => {
    if (!auditReason.trim()) return;
    setBusy(`retry-${runId}`);
    report(
      "Run CAT berhasil disiapkan ulang.",
      await retryCatTestRunAction(runId, auditReason),
    );
  };

  const handleVoid = async () => {
    if (!voidRunId || !auditReason.trim()) return;
    setBusy(`void-${voidRunId}`);
    const result = await voidCatTestRunAction(voidRunId, auditReason);
    setVoidRunId(null);
    report("Run CAT berhasil di-void.", result);
  };

  const handleDisconnectStart = async () => {
    if (!activeRun || !auditReason.trim()) return;
    setBusy("disconnect-start");
    report(
      "Marker disconnect berhasil dimulai dan dicatat di audit delivery.",
      await startTryoutDisconnectAction(attempt.id, activeRun.id, auditReason),
    );
  };

  const handleDisconnectReconcile = async () => {
    if (!activeRun || !auditReason.trim()) return;
    setBusy("disconnect-reconcile");
    report(
      "Marker disconnect berhasil direkonsiliasi dari waktu server.",
      await reconcileTryoutDisconnectAction(attempt.id, activeRun.id, auditReason),
    );
  };

  return (
    <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-start gap-3"><Button aria-label="Kembali ke detail sesi Tryout" className="mt-1 shrink-0 rounded-xl text-secondary-500 hover:bg-primary-50 hover:text-secondary-900" nativeButton={false} render={<Link href={backHref ?? buildMentorTryoutOperationsHref(initial.id, { delivery: "sessions", session: delivery.id, workspace: "schedule" })} />} size="icon" title="Kembali ke detail sesi Tryout" variant="ghost"><ChevronLeft aria-hidden="true" className="size-5" /></Button><ReferencePageHeader actions={<StatusBadge status={attempt.status} />} className="min-w-0 flex-1" description={delivery.name} title={attempt.student} /></div>
      <OperationNotice message={notice} />
      <AssessmentReleaseNotice label="Konten attempt" release={attempt.assessmentRelease} />
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]">
        <AttemptRunsSection attempt={attempt} auditReason={auditReason} busy={busy} onRetry={(runId) => void handleRetry(runId)} onVoid={setVoidRunId} />
        <AttemptActionPanel activeRun={activeRun} attempt={attempt} auditReason={auditReason} busy={busy} onAuditReasonChange={setAuditReason} onCalculate={() => void handleCalculate()} onDisconnectReconcile={() => void handleDisconnectReconcile()} onDisconnectStart={() => void handleDisconnectStart()} />
      </div>
      <AttemptVoidDialog busy={busy} onConfirm={() => void handleVoid()} onOpenChange={(open) => { if (!open && !busy) setVoidRunId(null); }} open={Boolean(voidRunId)} />
    </div>
  );
}

export { KaptenTryoutAttemptDetailPageModule };

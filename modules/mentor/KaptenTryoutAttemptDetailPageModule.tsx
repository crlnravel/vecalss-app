"use client";

import { Calculator, RotateCcw, ShieldAlert } from "@/lib/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
import { StatusBadge } from "@/modules/mentor/KaptenTryoutOperationsModule";
import {
  AssessmentReleaseNotice,
  OperationalPageHeader,
  OperationNotice,
} from "@/modules/mentor/KaptenTryoutOperationalShared";
import {
  calculateTryoutAttemptAction,
  reconcileTryoutDisconnectAction,
  retryCatTestRunAction,
  startTryoutDisconnectAction,
  voidCatTestRunAction,
} from "@/modules/mentor/tryout-actions";

function formatTimestamp(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function KaptenTryoutAttemptDetailPageModule({
  attemptId,
  initial,
}: {
  attemptId: string;
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
      <OperationalPageHeader
        backHref={`/mentor/tryout/${initial.id}/operations/sessions/${delivery.id}`}
        description={delivery.name}
        title={attempt.student}
        trailing={<StatusBadge status={attempt.status} />}
      />
      <OperationNotice message={notice} />
      <AssessmentReleaseNotice
        label="Konten attempt"
        release={attempt.assessmentRelease}
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]">
        <section className="grid content-start gap-3" aria-labelledby="attempt-runs-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="attempt-runs-title" className="text-xl font-semibold">Tujuh Test</h2>
            <span className="text-sm font-medium text-secondary-700">
              Indeks internal 0–100 {attempt.score !== null ? Number(attempt.score).toFixed(2) : "belum dihitung"}
            </span>
          </div>
          {attempt.runs.map((run) => (
            <Card className="shadow-none ring-primary-100" key={run.id} size="sm">
              <CardHeader>
                <CardTitle className="font-semibold">Test {run.sequenceNo}</CardTitle>
                <CardDescription>
                  CAT {run.catState} · {run.integrityEvents} sinyal integritas
                </CardDescription>
                <CardAction>
                  <StatusBadge status={run.status} />
                </CardAction>
              </CardHeader>
              {run.catState !== "not_applicable" && run.catState !== "voided" ? (
                <CardContent className="flex flex-wrap gap-2">
                  {run.catState === "failed" ? (
                    <Button
                      disabled={!auditReason.trim() || Boolean(busy)}
                      onClick={() => void handleRetry(run.id)}
                      size="sm"
                      variant="brandOutline"
                    >
                      <RotateCcw data-icon="inline-start" />
                      {busy === `retry-${run.id}` ? "Memproses…" : "Coba lagi CAT"}
                    </Button>
                  ) : null}
                  <Button
                    disabled={!auditReason.trim() || Boolean(busy)}
                    onClick={() => setVoidRunId(run.id)}
                    size="sm"
                    variant="destructive"
                  >
                    <ShieldAlert data-icon="inline-start" />
                    Void CAT
                  </Button>
                </CardContent>
              ) : null}
            </Card>
          ))}
        </section>

        <aside>
          <Card className="shadow-none ring-primary-100">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Tindakan attempt</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field>
                <FieldLabel htmlFor="attempt-audit-reason">Alasan audit</FieldLabel>
                <FieldInput
                  id="attempt-audit-reason"
                  onChange={(event) => setAuditReason(event.target.value)}
                  placeholder="Jelaskan alasan tindakan"
                  value={auditReason}
                />
              </Field>
              <Button
                disabled={!auditReason.trim() || Boolean(busy)}
                onClick={() => void handleCalculate()}
                variant="brand"
              >
                <Calculator data-icon="inline-start" />
                {busy === "calculate" ? "Menghitung…" : "Hitung hasil"}
              </Button>
              <div className="grid gap-3 rounded-2xl border border-primary-100 bg-primary-50/45 p-4" role="status">
                <div>
                  <p className="font-semibold text-secondary-900">Lifecycle disconnect</p>
                  <p className="mt-1 text-xs leading-5 text-secondary-600">Marker hanya berubah lewat perintah server berwenang. Fokus, fullscreen, timer, dan sinyal browser tidak memulai disconnect.</p>
                </div>
                {attempt.disconnectStartedAt ? (
                  <div className="text-sm leading-6 text-secondary-700">
                    <p>Dimulai {formatTimestamp(attempt.disconnectStartedAt)}</p>
                    {attempt.reconciledAt ? <p>Direkonsiliasi {formatTimestamp(attempt.reconciledAt)} · total {attempt.totalDisconnectSeconds} detik</p> : <p className="font-medium text-[#6a4a00]">Menunggu reconcile operator.</p>}
                  </div>
                ) : <p className="text-sm text-secondary-600">Belum ada marker disconnect.</p>}
                <div className="flex flex-wrap gap-2">
                  {!attempt.disconnectStartedAt ? (
                    <Button disabled={!activeRun || !auditReason.trim() || Boolean(busy)} onClick={() => void handleDisconnectStart()} size="sm" variant="brandOutline">
                      <ShieldAlert data-icon="inline-start" />
                      {busy === "disconnect-start" ? "Memulai…" : "Mulai disconnect"}
                    </Button>
                  ) : !attempt.reconciledAt ? (
                    <Button disabled={!activeRun || !auditReason.trim() || Boolean(busy)} onClick={() => void handleDisconnectReconcile()} size="sm" variant="brandOutline">
                      <ShieldAlert data-icon="inline-start" />
                      {busy === "disconnect-reconcile" ? "Merekonsiliasi…" : "Rekonsiliasi disconnect"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !busy) setVoidRunId(null);
        }}
        open={Boolean(voidRunId)}
      >
        <AlertDialogContent variant="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>Void run CAT?</AlertDialogTitle>
            <AlertDialogDescription>
              Run dikeluarkan dari perhitungan dan dapat memblokir rilis hasil.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busy)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(busy)}
              onClick={(event) => {
                event.preventDefault();
                void handleVoid();
              }}
              variant="destructive"
            >
              {busy ? "Memproses…" : "Void CAT"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export { KaptenTryoutAttemptDetailPageModule };

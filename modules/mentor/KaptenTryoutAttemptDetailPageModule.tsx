"use client";

import Link from "next/link";
import { Calculator, ChevronLeft, ShieldAlert } from "@/lib/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ReferencePageHeader, ReferenceSectionHeading, ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
  REFERENCE_SURFACE_CLASS_NAMES,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
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
} from "@/modules/mentor/KaptenTryoutOperationalShared";
import { calculateTryoutAttemptAction, reconcileTryoutDisconnectAction, startTryoutDisconnectAction } from "@/modules/mentor/tryout-actions";

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

function AttemptRunCard({ run }: { run: AttemptRun }) {
  return (
    <Card className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "ring-0")} size="sm">
      <CardHeader><CardTitle className="font-semibold">Tes {run.sequenceNo}</CardTitle><CardDescription>Ujian berbasis komputer · {run.integrityEvents} catatan pemantauan ujian</CardDescription><CardAction><StatusBadge status={run.status} /></CardAction></CardHeader>
    </Card>
  );
}

function AttemptRunsSection({ attempt }: { attempt: AttemptRecord }) {
  return (
    <section aria-labelledby="attempt-runs-title" className="grid content-start gap-3">
      <div className="flex items-center justify-between gap-3"><h2 id="attempt-runs-title" className="text-xl font-semibold">Tujuh tes tryout</h2><span className="text-sm font-medium text-secondary-700">Skor dari 100: {attempt.score !== null ? Number(attempt.score).toFixed(2) : "belum dihitung"}</span></div>
      {attempt.runs.map((run) => <AttemptRunCard key={run.id} run={run} />)}
    </section>
  );
}

function AttemptDisconnectStatus({ activeRun, attempt, auditReason, busy, onReconcile, onStart }: { activeRun: AttemptRun | null; attempt: AttemptRecord; auditReason: string; busy: string | null; onReconcile: () => void; onStart: () => void }) {
  return (
    <ReferenceSurface className="grid gap-3 p-4" role="status" variant="inset">
      <div><p className="font-semibold text-secondary-900">Gangguan koneksi peserta</p><p className="mt-1 text-xs leading-5 text-secondary-600">Catat waktu saat koneksi peserta terputus, lalu selesaikan pencatatan setelah tersambung kembali. Beralih tab atau aplikasi, keluar dari layar penuh, atau timer habis tidak otomatis menandakan koneksi terputus.</p></div>
      {attempt.disconnectStartedAt ? <div className="text-sm leading-6 text-secondary-700"><p>Waktu mulai tercatat {formatTimestamp(attempt.disconnectStartedAt)}</p>{attempt.reconciledAt ? <p>Durasi tercatat {attempt.totalDisconnectSeconds} detik · pencatatan selesai {formatTimestamp(attempt.reconciledAt)}</p> : <p className="font-medium text-[var(--voyage-warm-sun-ink)]">Menunggu pengelola menyelesaikan pencatatan.</p>}</div> : <p className="text-sm text-secondary-600">Belum ada catatan gangguan koneksi.</p>}
      <div className="flex flex-wrap gap-2">{!attempt.disconnectStartedAt ? <Button disabled={!activeRun || !auditReason.trim() || Boolean(busy)} onClick={onStart} size="sm" variant="outline"><ShieldAlert data-icon="inline-start" />{busy === "disconnect-start" ? "Mencatat…" : "Catat waktu mulai"}</Button> : !attempt.reconciledAt ? <Button disabled={!activeRun || !auditReason.trim() || Boolean(busy)} onClick={onReconcile} size="sm" variant="outline"><ShieldAlert data-icon="inline-start" />{busy === "disconnect-reconcile" ? "Menyelesaikan…" : "Selesaikan pencatatan"}</Button> : null}</div>
    </ReferenceSurface>
  );
}

function AttemptActionPanel({ activeRun, attempt, auditReason, busy, onAuditReasonChange, onCalculate, onDisconnectReconcile, onDisconnectStart }: { activeRun: AttemptRun | null; attempt: AttemptRecord; auditReason: string; busy: string | null; onAuditReasonChange: (value: string) => void; onCalculate: () => void; onDisconnectReconcile: () => void; onDisconnectStart: () => void }) {
  return (
    <aside><Card className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "ring-0")}><CardHeader><CardTitle className="text-lg font-semibold">Tindakan pengerjaan</CardTitle></CardHeader><CardContent className="grid gap-4"><Field><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="attempt-audit-reason" required>Alasan tindakan yang akan dicatat</FieldLabel><FieldInput aria-required="true" className={REFERENCE_CONTROL_CLASS_NAMES.input} id="attempt-audit-reason" onChange={(event) => onAuditReasonChange(event.target.value)} placeholder="Jelaskan alasan tindakan" required value={auditReason} /></Field><Button disabled={!auditReason.trim() || Boolean(busy)} onClick={onCalculate} variant="default"><Calculator data-icon="inline-start" />{busy === "calculate" ? "Menghitung…" : "Hitung skor"}</Button><AttemptDisconnectStatus activeRun={activeRun} attempt={attempt} auditReason={auditReason} busy={busy} onReconcile={onDisconnectReconcile} onStart={onDisconnectStart} /></CardContent></Card></aside>
  );
}

function KaptenTryoutAttemptDetailPageModule({
  backHref,
  attemptId,
  embedded = false,
  initial,
  readOnly = false,
}: {
  attemptId: string;
  backHref?: string;
  embedded?: boolean;
  initial: TryoutOperationsView;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const delivery = initial.sessions.find((session) =>
    session.attempts.some((attempt) => attempt.id === attemptId),
  )!;
  const attempt = delivery.attempts.find((item) => item.id === attemptId)!;
  const activeRun = attempt.runs.find((run) => run.status === "active") ?? null;
  const [auditReason, setAuditReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const report = (message: string, result: { ok: boolean; message?: string }) => {
    setBusy(null);
    if (!result.ok) {
      showToast(result.message ?? "Tindakan pengerjaan tidak dapat diproses.", {
        variant: "error",
      });
      return;
    }
    setAuditReason("");
    showToast(message, { variant: "success" });
    router.refresh();
  };

  const handleCalculate = async () => {
    if (readOnly || !auditReason.trim()) return;
    setBusy("calculate");
    report(
      "Skor tryout berhasil dihitung.",
      await calculateTryoutAttemptAction(attempt.id, auditReason),
    );
  };

  const handleDisconnectStart = async () => {
    if (readOnly || !activeRun || !auditReason.trim()) return;
    setBusy("disconnect-start");
    report(
      "Waktu mulai gangguan koneksi berhasil dicatat.",
      await startTryoutDisconnectAction(attempt.id, activeRun.id, auditReason),
    );
  };

  const handleDisconnectReconcile = async () => {
    if (readOnly || !activeRun || !auditReason.trim()) return;
    setBusy("disconnect-reconcile");
    report(
      "Pencatatan gangguan koneksi selesai. Durasi dihitung berdasarkan waktu sistem.",
      await reconcileTryoutDisconnectAction(attempt.id, activeRun.id, auditReason),
    );
  };

  return (
    <div className={embedded ? "w-full" : "w-full px-4 py-5 sm:px-6 lg:px-8"}>
      {embedded ? null : <div className="flex min-w-0 items-start gap-3"><Button aria-label="Kembali ke detail sesi Tryout" className="mt-1 shrink-0" nativeButton={false} render={<Link href={backHref ?? buildMentorTryoutOperationsHref(initial.id, { delivery: "sessions", session: delivery.id, workspace: "operations" })} />} size="icon" title="Kembali ke detail sesi Tryout" variant="outline"><ChevronLeft aria-hidden="true" className="size-5" /></Button><ReferencePageHeader actions={<StatusBadge status={attempt.status} />} className="min-w-0 flex-1" title={attempt.student} /></div>}
      {embedded && readOnly ? <ReferenceSectionHeading action={<StatusBadge status={attempt.status} />} title={attempt.student} /> : null}
      <AssessmentReleaseNotice label="Konten yang digunakan" missingDescription="Versi konten untuk pengerjaan ini belum tersedia. Periksa kembali detail sesi Tryout." release={attempt.assessmentRelease} />
      <div className={cn("mt-5 grid gap-5", !readOnly && "xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]")}>
        <AttemptRunsSection attempt={attempt} />
        {readOnly ? null : <AttemptActionPanel activeRun={activeRun} attempt={attempt} auditReason={auditReason} busy={busy} onAuditReasonChange={setAuditReason} onCalculate={() => void handleCalculate()} onDisconnectReconcile={() => void handleDisconnectReconcile()} onDisconnectStart={() => void handleDisconnectStart()} />}
      </div>
    </div>
  );
}

export { KaptenTryoutAttemptDetailPageModule };

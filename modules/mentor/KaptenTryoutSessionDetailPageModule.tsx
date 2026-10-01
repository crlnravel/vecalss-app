"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  ReferencePageHeader,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
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
import { showToast } from "@/components/ui/toast";
import { Field, FieldInput } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { formatTryoutDateTimeLocal } from "@/lib/tryout/time";
import { ChevronLeft } from "@/lib/icons";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutStatusBadge";
import { HelpFieldLabel } from "@/modules/mentor/KaptenTryoutOperationalShared";
import { openTryoutDeliverySessionAction, updateTryoutDeliverySessionScheduleAction } from "@/modules/mentor/tryout-actions";

type Confirmation = "open" | null;

const attemptStateLabels: Record<string, string> = {
  abandoned: "Ditinggalkan",
  auto_submitted: "Terkirim otomatis",
  expired: "Kedaluwarsa",
  in_progress: "Berlangsung",
  not_started: "Belum mulai",
  scored: "Dinilai",
  submitted: "Terkirim",
  void: "Dibatalkan",
};

type DeliverySession = TryoutOperationsView["sessions"][number];
type SessionSchedule = { availableFrom: string; availableUntil: string };

function SessionDetailHeader({ busy, delivery, initial, onOpen }: { busy: boolean; delivery: DeliverySession; initial: TryoutOperationsView; onOpen: () => void }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Button aria-label="Kembali ke operasional Tryout" className="mt-1 shrink-0" nativeButton={false} render={<Link href={`/mentor/tryout/${initial.id}?workspace=operations`} />} size="icon" title="Kembali ke operasional Tryout" variant="outline"><ChevronLeft aria-hidden="true" className="size-5" /></Button>
      <ReferencePageHeader
        actions={<div className="flex flex-wrap items-center justify-end gap-2"><StatusBadge status={delivery.status} />{initial.status === "published" && delivery.status === "draft" ? <Button disabled={busy} onClick={onOpen} variant="default">Buka sesi</Button> : null}</div>}
        className="min-w-0 flex-1"
        title={delivery.name}
      />
    </div>
  );
}

function SessionScheduleCard({
  onScheduleChange,
  onSave,
  validationMessage,
  schedule,
  scheduleBusy,
  scheduleChanged,
  scheduleLocked,
  onOpen,
  openBusy = false,
  title = "Detail sesi",
}: {
  onOpen?: () => void;
  onSave: () => void;
  openBusy?: boolean;
  onScheduleChange: (schedule: SessionSchedule) => void;
  schedule: SessionSchedule;
  scheduleBusy: boolean;
  scheduleChanged: boolean;
  scheduleLocked: boolean;
  validationMessage?: string | null;
  title?: string;
}) {
  return (
    <section
      aria-labelledby="session-schedule-title"
      className="mt-6 border-t border-primary-100 pt-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h3
          className="text-lg font-semibold text-secondary-900"
          id="session-schedule-title"
        >
          {title}
        </h3>
        {onOpen ? (
          <Button disabled={openBusy} onClick={onOpen} variant="default">
            Buka sesi
          </Button>
        ) : null}
      </header>
      <div className="mt-6 grid gap-6">
        <div className="grid gap-5 text-sm md:grid-cols-2">
          <Field><HelpFieldLabel htmlFor="session-detail-from" label="Mulai (WIB)" required tooltip="Peserta hanya dapat memulai attempt setelah waktu ini." /><FieldInput aria-describedby={validationMessage ? "session-detail-schedule-error" : undefined} aria-invalid={Boolean(validationMessage) || undefined} aria-required="true" className={REFERENCE_CONTROL_CLASS_NAMES.input} disabled={scheduleLocked || scheduleBusy} id="session-detail-from" onChange={(event) => onScheduleChange({ ...schedule, availableFrom: event.target.value })} type="datetime-local" value={schedule.availableFrom} /></Field>
          <Field><HelpFieldLabel htmlFor="session-detail-until" label="Selesai (WIB)" required tooltip="Setelah waktu ini peserta tidak dapat memulai attempt baru." /><FieldInput aria-describedby={validationMessage ? "session-detail-schedule-error" : undefined} aria-invalid={Boolean(validationMessage) || undefined} aria-required="true" className={REFERENCE_CONTROL_CLASS_NAMES.input} disabled={scheduleLocked || scheduleBusy} id="session-detail-until" min={schedule.availableFrom || undefined} onChange={(event) => onScheduleChange({ ...schedule, availableUntil: event.target.value })} type="datetime-local" value={schedule.availableUntil} /></Field>
        </div>
        {validationMessage ? <p className="text-sm text-student-status-danger-fg" id="session-detail-schedule-error" role="alert">{validationMessage}</p> : null}
        <div className="flex flex-col gap-3 border-t border-primary-100 pt-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="text-sm">
            {scheduleLocked ? <p className="mt-2 text-xs text-secondary-600">Jadwal dikunci setelah sesi memiliki attempt atau ditutup.</p> : null}
          </div>
          <Button disabled={scheduleLocked || scheduleBusy || !scheduleChanged} onClick={onSave} variant="outline">{scheduleBusy ? "Menyimpan…" : "Simpan jadwal"}</Button>
        </div>
      </div>
    </section>
  );
}

function SessionAttemptsTable({ delivery, tryoutId }: { delivery: DeliverySession; tryoutId: string }) {
  return (
    <section aria-labelledby="session-attempts-title" className="mt-8">
      <div className="flex items-center justify-between gap-3"><h2 id="session-attempts-title" className="text-xl font-semibold">Attempt peserta</h2><span className="text-sm text-secondary-600">{delivery.attempts.length} attempt</span></div>
      <ReferenceSurface className="mt-4 overflow-hidden p-0">
        <Table className="min-w-[760px]">
          <caption className="sr-only">Attempt peserta untuk {delivery.name}</caption>
          <TableHeader className="bg-secondary-50/80"><TableRow className="border-primary-100 hover:bg-secondary-50/80"><TableHead className="h-11 px-4 py-2.5 text-xs font-semibold text-secondary-700 sm:px-5">Peserta</TableHead><TableHead className="h-11 px-4 py-2.5 text-xs font-semibold text-secondary-700 sm:px-5">Test selesai</TableHead><TableHead className="h-11 px-4 py-2.5 text-xs font-semibold text-secondary-700 sm:px-5">Skor</TableHead><TableHead className="h-11 px-4 py-2.5 text-xs font-semibold text-secondary-700 sm:px-5">Status</TableHead><TableHead className="h-11 w-24 px-4 py-2.5 text-right text-xs font-semibold text-secondary-700 sm:px-5">Aksi</TableHead></TableRow></TableHeader>
          <TableBody>
            {delivery.attempts.length ? delivery.attempts.map((attempt) => <SessionAttemptRow attempt={attempt} key={attempt.id} tryoutId={tryoutId} />) : <TableRow className="hover:bg-transparent"><TableCell className="px-4 py-10 text-center text-sm text-secondary-600 sm:px-5" colSpan={5}>Belum ada attempt. Attempt muncul setelah peserta memulai sesi ini.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </ReferenceSurface>
    </section>
  );
}

function SessionAttemptRow({ attempt, tryoutId }: { attempt: DeliverySession["attempts"][number]; tryoutId: string }) {
  const completedRuns = attempt.runs.filter((run) => run.status === "sealed").length;
  const statusLabel = attemptStateLabels[attempt.attemptState] ?? attempt.attemptState;
  const statusTone = ["scored", "submitted", "auto_submitted"].includes(attempt.attemptState) ? "bg-primary-700" : "bg-voyage-warm-sun";
  return <TableRow className="border-primary-100 hover:bg-secondary-50/70"><TableCell className="px-4 py-3.5 sm:px-5"><span className="font-medium text-secondary-900">{attempt.student}</span></TableCell><TableCell className="px-4 py-3.5 text-secondary-700 sm:px-5">{completedRuns}/7</TableCell><TableCell className="px-4 py-3.5 font-medium text-secondary-900 sm:px-5">{attempt.score !== null ? `Indeks ${Number(attempt.score).toFixed(2)}` : "Belum dihitung"}</TableCell><TableCell className="px-4 py-3.5 sm:px-5"><span className="inline-flex items-center gap-2 text-sm text-secondary-700"><span aria-hidden="true" className={`size-2 rounded-full ${statusTone}`} />{statusLabel}</span></TableCell><TableCell className="px-4 py-3.5 text-right sm:px-5"><Button nativeButton={false} render={<Link href={`/mentor/tryout/${tryoutId}/operations/attempts/${attempt.id}`} />} size="sm" variant="outline">Lihat</Button></TableCell></TableRow>;
}

function SessionOpenDialog({ busy, onConfirm, onOpenChange, open }: { busy: boolean; onConfirm: () => void; onOpenChange: (open: boolean) => void; open: boolean }) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent variant="info"><AlertDialogHeader><AlertDialogTitle>Buka sesi?</AlertDialogTitle><AlertDialogDescription>Peserta yang ditugaskan dapat mengakses sesi sesuai jadwal.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); onConfirm(); }} variant="default">{busy ? "Memproses…" : "Buka sesi"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  );
}

function KaptenTryoutSessionDetailPageModule({
  embedded = false,
  initial,
  sessionId,
}: {
  embedded?: boolean;
  initial: TryoutOperationsView;
  sessionId: string;
}) {
  const router = useRouter();
  const delivery = initial.sessions.find((session) => session.id === sessionId)!;
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [busy, setBusy] = useState(false);
  const [schedule, setSchedule] = useState(() => ({
    availableFrom: formatTryoutDateTimeLocal(delivery.availableFrom),
    availableUntil: formatTryoutDateTimeLocal(delivery.availableUntil),
  }));
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const scheduleLocked = delivery.attempts.length > 0 || ["closed", "archived"].includes(delivery.status);
  const scheduleChanged = schedule.availableFrom !== formatTryoutDateTimeLocal(delivery.availableFrom)
    || schedule.availableUntil !== formatTryoutDateTimeLocal(delivery.availableUntil);
  const handleConfirm = async () => {
    if (!confirmation) return;
    setBusy(true);
    try {
      const result = await openTryoutDeliverySessionAction(
        delivery.id,
        "Membuka sesi Tryout",
      );
      setConfirmation(null);
      if (!result.ok) {
        showToast(result.message ?? "Tindakan tidak dapat diproses.", {
          variant: "error",
        });
        return;
      }
      showToast("Sesi berhasil dibuka.", { variant: "success" });
      router.refresh();
    } catch (actionError) {
      showToast(
        actionError instanceof Error
          ? actionError.message
          : "Tindakan tidak dapat diproses.",
        { variant: "error" },
      );
    } finally {
      setBusy(false);
    }
  };

  const handleScheduleSave = async () => {
    if (scheduleLocked || scheduleBusy || !scheduleChanged) return;
    if (!schedule.availableFrom || !schedule.availableUntil || new Date(schedule.availableUntil) <= new Date(schedule.availableFrom)) {
      setValidationNotice("Waktu selesai harus setelah waktu mulai.");
      return;
    }
    setScheduleBusy(true);
    setValidationNotice(null);
    try {
      const result = await updateTryoutDeliverySessionScheduleAction(
        {
          availableFrom: schedule.availableFrom,
          availableUntil: schedule.availableUntil,
          deliverySessionId: delivery.id,
        },
        "Memperbarui jadwal sesi Tryout",
      );
      if (!result.ok) {
        showToast(result.message ?? "Jadwal sesi tidak dapat diperbarui.", {
          variant: "error",
        });
        return;
      }
      showToast("Jadwal sesi berhasil diperbarui.", { variant: "success" });
      router.refresh();
    } catch (actionError) {
      showToast(
        actionError instanceof Error
          ? actionError.message
          : "Jadwal sesi tidak dapat diperbarui.",
        { variant: "error" },
      );
    } finally {
      setScheduleBusy(false);
    }
  };

  if (embedded) {
    return (
      <>
        <SessionScheduleCard
          onSave={() => void handleScheduleSave()}
          onScheduleChange={(next) => { setSchedule(next); setValidationNotice(null); }}
          schedule={schedule}
          scheduleBusy={scheduleBusy}
          scheduleChanged={scheduleChanged}
          scheduleLocked={scheduleLocked}
          validationMessage={validationNotice}
          onOpen={initial.status === "published" && delivery.status === "draft" ? () => setConfirmation("open") : undefined}
          openBusy={busy}
          title="Waktu akses peserta"
        />
        <SessionOpenDialog
          busy={busy}
          onConfirm={() => void handleConfirm()}
          onOpenChange={(open) => {
            if (!open && !busy) setConfirmation(null);
          }}
          open={Boolean(confirmation)}
        />
      </>
    );
  }

  return (
    <main className="w-full px-4 py-5 sm:px-6 lg:px-8">
      <SessionDetailHeader busy={busy} delivery={delivery} initial={initial} onOpen={() => setConfirmation("open")} />
      <SessionScheduleCard onSave={() => void handleScheduleSave()} onScheduleChange={(next) => { setSchedule(next); setValidationNotice(null); }} schedule={schedule} scheduleBusy={scheduleBusy} scheduleChanged={scheduleChanged} scheduleLocked={scheduleLocked} validationMessage={validationNotice} />
      <SessionAttemptsTable delivery={delivery} tryoutId={initial.id} />
      <SessionOpenDialog busy={busy} onConfirm={() => void handleConfirm()} onOpenChange={(open) => { if (!open && !busy) setConfirmation(null); }} open={Boolean(confirmation)} />
    </main>
  );
}

export { KaptenTryoutSessionDetailPageModule };

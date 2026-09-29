"use client";

import Link from "next/link";
import { Check, ChevronLeft, Link2, ShieldX, Unlink, X } from "@/lib/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ReferencePageHeader } from "@/components/dashboard/reference-dashboard-primitives";
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
import { showToast } from "@/components/ui/toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { selectMainTryoutSession } from "@/lib/tryout/main-session";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutOperationsModule";
import {
  admissionStatusLabels,
  assignmentStatusLabels,
  participantAttemptStateLabels,
  participantSessionStateLabels,
} from "@/modules/mentor/KaptenTryoutOperationsData";
import {
  assignTryoutDeliverySessionAction,
  decideTryoutAdmissionAction,
  revokeTryoutDeliveryAssignmentAction,
} from "@/modules/mentor/tryout-actions";

type Confirmation =
  | { kind: "reject" }
  | { assignmentId: string; kind: "revoke"; label: string }
  | null;

function ParticipantSummaryCard({
  participant,
}: {
  participant: TryoutOperationsView["participants"][number];
}) {
  return (
    <Card className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "mt-5 ring-0")}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Ringkasan peserta</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-xs font-medium text-secondary-500">Admission</p>
          <p className="mt-1 font-medium text-secondary-900">{admissionStatusLabels[participant.admission.status] ?? participant.admission.status}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-secondary-500">Sesi</p>
          <p className="mt-1 font-medium text-secondary-900">{participant.session?.name ?? "Belum ditugaskan"}</p>
          <p className="mt-0.5 text-xs text-secondary-600">{participantSessionStateLabels[participant.session?.state ?? "not_assigned"]}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-secondary-500">Attempt</p>
          <p className="mt-1 font-medium text-secondary-900">{participant.attempt ? participantAttemptStateLabels[participant.attempt.attemptState] ?? participant.attempt.attemptState : "Belum mulai"}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-secondary-500">Nilai &amp; rilis</p>
          <p className="mt-1 font-medium text-secondary-900">{participant.score.score === null ? "Belum dihitung" : Number(participant.score.score).toFixed(2)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ParticipantSessionAssignments({
  activeSessions,
  admission,
  auditReason,
  busy,
  selectedSessionId,
  setConfirmation,
  setSelectedSessionId,
}: {
  activeSessions: TryoutOperationsView["sessions"];
  admission: TryoutOperationsView["admissions"][number];
  auditReason: string;
  busy: boolean;
  selectedSessionId: string;
  setConfirmation: (c: Confirmation) => void;
  setSelectedSessionId: (id: string) => void;
}) {
  return (
    <section className="grid content-start gap-5">
      {admission.status === "pending" && activeSessions.length ? (
        <Card className="shadow-none ring-primary-100">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Sesi saat menyetujui</CardTitle>
            <p className="text-sm text-secondary-600">Kosongkan pilihan untuk memakai sesi default yang memenuhi syarat.</p>
          </CardHeader>
          <CardContent>
            <RadioGroup
              className="grid gap-2"
              onValueChange={setSelectedSessionId}
              value={selectedSessionId}
            >
              {activeSessions.map((session) => (
                <Field
                  className={cn(REFERENCE_CONTROL_CLASS_NAMES.choice, "flex-row items-center p-3.5 has-[[data-checked]]:border-primary-700/35 has-[[data-checked]]:bg-primary-50")}
                  key={`approve-${session.id}`}
                >
                  <RadioGroupItem id={`approve-${session.id}`} value={session.id} />
                  <FieldLabel className="flex-1 cursor-pointer text-sm font-medium leading-6 tracking-normal" htmlFor={`approve-${session.id}`}>
                    {session.name}
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      ) : null}
      <Card className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "ring-0")}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Penugasan sesi</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {admission.assignments.length ? (
            admission.assignments.map((assignment) => (
              <div
                className={cn(
                  REFERENCE_SURFACE_CLASS_NAMES.inset,
                  "flex flex-wrap items-center justify-between gap-3 p-3.5",
                )}
                key={assignment.id}
              >
                <div>
                  <p className="font-medium text-secondary-900">{assignment.name}</p>
                  <p className="mt-1 text-xs text-secondary-600">
                    {assignmentStatusLabels[assignment.status] ?? assignment.status}
                  </p>
                </div>
                {assignment.status === "active" ? (
                  <Button
                    disabled={!auditReason.trim() || busy}
                    onClick={() =>
                      setConfirmation({
                        assignmentId: assignment.id,
                        kind: "revoke",
                        label: assignment.name,
                      })
                    }
                    size="sm"
                    variant="destructive"
                  >
                    <Unlink data-icon="inline-start" />
                    Cabut akses
                  </Button>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-secondary-600">Belum ada penugasan sesi.</p>
          )}
        </CardContent>
      </Card>

      {admission.status === "active" && activeSessions.length ? (
        <Card className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "ring-0")}>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Tugaskan sesi</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              className="grid gap-2"
              onValueChange={setSelectedSessionId}
              value={selectedSessionId}
            >
              {activeSessions.map((session) => (
                <Field
                  className={cn(REFERENCE_CONTROL_CLASS_NAMES.choice, "flex-row items-center p-3.5 has-[[data-checked]]:border-primary-700/35 has-[[data-checked]]:bg-primary-50")}
                  key={session.id}
                >
                  <RadioGroupItem id={`assign-${session.id}`} value={session.id} />
                  <FieldLabel className="flex-1 cursor-pointer text-sm font-medium leading-6 tracking-normal" htmlFor={`assign-${session.id}`}>
                    {session.name}
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

function ParticipantActionsPanel({
  activeSessionsLength,
  admissionStatus,
  auditReason,
  busy,
  handleApprove,
  handleAssign,
  selectedSessionId,
  setAuditReason,
  setConfirmation,
}: {
  activeSessionsLength: number;
  admissionStatus: string;
  auditReason: string;
  busy: boolean;
  handleApprove: () => Promise<void>;
  handleAssign: () => Promise<void>;
  selectedSessionId: string;
  setAuditReason: (val: string) => void;
  setConfirmation: (c: Confirmation) => void;
}) {
  return (
    <aside>
      <Card className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "ring-0")}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Tindakan peserta</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="participant-audit-reason" required>Alasan audit</FieldLabel>
            <FieldInput
              aria-required="true"
              className={REFERENCE_CONTROL_CLASS_NAMES.input}
              id="participant-audit-reason"
              onChange={(event) => setAuditReason(event.target.value)}
              placeholder="Jelaskan alasan tindakan"
              required
              value={auditReason}
            />
          </Field>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {admissionStatus === "pending" ? (
              <>
                <Button
                  disabled={!auditReason.trim() || busy}
                  onClick={() => void handleApprove()}
                  variant="brand"
                >
                  <Check data-icon="inline-start" />
                  Setujui
                </Button>
                <Button
                  disabled={!auditReason.trim() || busy}
                  onClick={() => setConfirmation({ kind: "reject" })}
                  variant="destructive"
                >
                  <X data-icon="inline-start" />
                  Tolak
                </Button>
              </>
            ) : null}
            {admissionStatus === "active" && activeSessionsLength ? (
              <Button
                disabled={!auditReason.trim() || !selectedSessionId || busy}
                onClick={() => void handleAssign()}
                variant="brand"
              >
                <Link2 data-icon="inline-start" />
                Tugaskan sesi
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

function ParticipantConfirmationDialog({
  busy,
  confirmation,
  handleConfirm,
  setConfirmation,
}: {
  busy: boolean;
  confirmation: Confirmation;
  handleConfirm: () => Promise<void>;
  setConfirmation: (c: Confirmation) => void;
}) {
  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open && !busy) setConfirmation(null);
      }}
      open={Boolean(confirmation)}
    >
      <AlertDialogContent variant="danger">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {confirmation?.kind === "reject"
              ? "Tolak admission?"
              : "Cabut akses sesi?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirmation?.kind === "reject"
              ? "Peserta tidak akan memperoleh akses ke Tryout ini."
              : `Peserta tidak dapat memulai ${confirmation?.kind === "revoke" ? confirmation.label : "sesi ini"}; riwayat attempt tetap dipertahankan.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            variant="destructive"
          >
            <ShieldX data-icon="inline-start" />
            {busy ? "Memproses…" : "Konfirmasi"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function KaptenTryoutParticipantDetailPageModule({
  admissionId,
  embedded = false,
  initial,
}: {
  admissionId: string;
  embedded?: boolean;
  initial: TryoutOperationsView;
}) {
  const router = useRouter();
  const admission = initial.admissions.find((item) => item.id === admissionId)!;
  const participant = initial.participants.find((item) => item.admissionId === admissionId)!;
  const mainSession = selectMainTryoutSession(initial.sessions);
  const [auditReason, setAuditReason] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState(mainSession?.id ?? "");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [busy, setBusy] = useState(false);
  const activeSessions = mainSession
    && mainSession.status === "active"
    && !admission.assignments.some(
      (assignment) =>
        assignment.deliverySessionId === mainSession.id &&
        assignment.status === "active",
    )
    ? [mainSession]
    : [];

  const report = (message: string, result: { ok: boolean; message?: string }) => {
    setBusy(false);
    if (!result.ok) {
      showToast(result.message ?? "Tindakan peserta tidak dapat diproses.", {
        variant: "error",
      });
      return;
    }
    setAuditReason("");
    showToast(message, { variant: "success" });
    router.refresh();
  };

  const handleApprove = async () => {
    if (!auditReason.trim()) return;
    setBusy(true);
    report(
      "Admission peserta berhasil disetujui.",
      await decideTryoutAdmissionAction(admission.id, "approve", auditReason, selectedSessionId || null),
    );
  };

  const handleAssign = async () => {
    if (!auditReason.trim() || !selectedSessionId) return;
    setBusy(true);
    const result = await assignTryoutDeliverySessionAction(
      { admissionId: admission.id, deliverySessionId: selectedSessionId },
      auditReason,
    );
    if (result.ok) setSelectedSessionId("");
    report("Peserta berhasil ditugaskan ke sesi.", result);
  };

  const handleConfirm = async () => {
    if (!confirmation || !auditReason.trim()) return;
    setBusy(true);
    const result =
      confirmation.kind === "reject"
        ? await decideTryoutAdmissionAction(admission.id, "reject", auditReason)
        : await revokeTryoutDeliveryAssignmentAction(
            confirmation.assignmentId,
            auditReason,
          );
    const successMessage =
      confirmation.kind === "reject"
        ? "Admission peserta berhasil ditolak."
        : "Akses sesi peserta berhasil dicabut.";
    setConfirmation(null);
    report(successMessage, result);
  };

  return (
    <div className={embedded ? "w-full" : "w-full px-4 py-5 sm:px-6 lg:px-8"}>
      {embedded ? null : <div className="flex min-w-0 items-start gap-3">
        <Button
          aria-label="Kembali ke daftar peserta Tryout"
          className="mt-1 shrink-0 rounded-xl text-secondary-500 hover:bg-primary-50 hover:text-secondary-900"
          nativeButton={false}
          render={<Link href={`/mentor/tryout/${initial.id}?workspace=participants`} />}
          size="icon"
          title="Kembali ke daftar peserta Tryout"
          variant="ghost"
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </Button>
        <ReferencePageHeader
          actions={<StatusBadge status={admission.status} />}
          className="min-w-0 flex-1"
          title={admission.student}
        />
      </div>}
      <ParticipantSummaryCard participant={participant} />

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <ParticipantSessionAssignments
          activeSessions={activeSessions}
          admission={admission}
          auditReason={auditReason}
          busy={busy}
          selectedSessionId={selectedSessionId}
          setConfirmation={setConfirmation}
          setSelectedSessionId={setSelectedSessionId}
        />

        <ParticipantActionsPanel
          activeSessionsLength={activeSessions.length}
          admissionStatus={admission.status}
          auditReason={auditReason}
          busy={busy}
          handleApprove={handleApprove}
          handleAssign={handleAssign}
          selectedSessionId={selectedSessionId}
          setAuditReason={setAuditReason}
          setConfirmation={setConfirmation}
        />
      </div>

      <ParticipantConfirmationDialog
        busy={busy}
        confirmation={confirmation}
        handleConfirm={handleConfirm}
        setConfirmation={setConfirmation}
      />
    </div>
  );
}

export { KaptenTryoutParticipantDetailPageModule };

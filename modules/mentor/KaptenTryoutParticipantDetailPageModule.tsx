"use client";

import { Check, Link2, ShieldX, Unlink, X } from "@/lib/icons";
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
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutOperationsModule";
import { assignmentStatusLabels } from "@/modules/mentor/KaptenTryoutOperationsData";
import {
  OperationalPageHeader,
  OperationNotice,
} from "@/modules/mentor/KaptenTryoutOperationalShared";
import {
  assignTryoutDeliverySessionAction,
  decideTryoutAdmissionAction,
  revokeTryoutDeliveryAssignmentAction,
} from "@/modules/mentor/tryout-actions";

type Confirmation =
  | { kind: "reject" }
  | { assignmentId: string; kind: "revoke"; label: string }
  | null;

function KaptenTryoutParticipantDetailPageModule({
  admissionId,
  initial,
}: {
  admissionId: string;
  initial: TryoutOperationsView;
}) {
  const router = useRouter();
  const admission = initial.admissions.find((item) => item.id === admissionId)!;
  const [auditReason, setAuditReason] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const activeSessions = initial.sessions.filter(
    (session) =>
      session.status === "active" &&
      !admission.assignments.some(
        (assignment) =>
          assignment.deliverySessionId === session.id &&
          assignment.status === "active",
      ),
  );

  const report = (message: string, result: { ok: boolean; message?: string }) => {
    setBusy(false);
    if (!result.ok) {
      setNotice(result.message ?? "Tindakan peserta tidak dapat diproses.");
      return;
    }
    setAuditReason("");
    setNotice(message);
    router.refresh();
  };

  const handleApprove = async () => {
    if (!auditReason.trim()) return;
    setBusy(true);
    report(
      "Admission peserta berhasil disetujui.",
      await decideTryoutAdmissionAction(admission.id, "approve", auditReason),
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
    <main className="w-full px-4 py-5 sm:px-6 lg:px-8">
      <OperationalPageHeader
        backHref={`/mentor/tryout/${initial.id}?workspace=participants`}
        description={initial.title}
        title={admission.student}
        trailing={<StatusBadge status={admission.status} />}
      />
      <OperationNotice message={notice} />

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <section className="grid content-start gap-5">
          <Card className="shadow-none ring-primary-100">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Penugasan sesi</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {admission.assignments.length ? (
                admission.assignments.map((assignment) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-100 p-3.5"
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
            <Card className="shadow-none ring-primary-100">
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
                      className="flex-row items-center rounded-2xl border border-secondary-900/14 p-3.5 has-[[data-checked]]:border-primary-700/35 has-[[data-checked]]:bg-primary-50"
                      key={session.id}
                    >
                      <RadioGroupItem id={`assign-${session.id}`} value={session.id} />
                      <FieldLabel className="flex-1 cursor-pointer text-sm font-medium" htmlFor={`assign-${session.id}`}>
                        {session.name}
                      </FieldLabel>
                    </Field>
                  ))}
                </RadioGroup>
              </CardContent>
            </Card>
          ) : null}
        </section>

        <aside>
          <Card className="shadow-none ring-primary-100">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Tindakan peserta</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field>
                <FieldLabel htmlFor="participant-audit-reason">Alasan audit</FieldLabel>
                <FieldInput
                  id="participant-audit-reason"
                  onChange={(event) => setAuditReason(event.target.value)}
                  placeholder="Jelaskan alasan tindakan"
                  value={auditReason}
                />
              </Field>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {admission.status === "pending" ? (
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
                {admission.status === "active" && activeSessions.length ? (
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
      </div>

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
    </main>
  );
}

export { KaptenTryoutParticipantDetailPageModule };

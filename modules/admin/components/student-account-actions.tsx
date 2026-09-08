"use client";

import { useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { UserStatus } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";
import { SubmitButton } from "@/modules/auth/components/submit-button";

import { StudentPasswordDialog } from "./student-password-dialog";
import {
  deleteStudentEnrollmentAction,
  deactivateStudentEnrollmentAction,
  reactivateStudentEnrollmentAction,
} from "../actions";

type PendingAction = "ban" | "delete" | "unban";

const pendingActionCopy = {
  ban: {
    actionLabel: "Nonaktifkan pengguna",
    confirmation: "deactivate",
    description: "Akses siswa akan dinonaktifkan dan sesi aktifnya dicabut.",
    dialogVariant: "warning",
    formAction: deactivateStudentEnrollmentAction,
    submitVariant: "destructive",
    title: "Nonaktifkan pengguna?",
  },
  delete: {
    actionLabel: "Hapus pengguna",
    confirmation: "delete",
    description: "Siswa akan dihapus dari direktori dan akses akunnya dicabut.",
    dialogVariant: "danger",
    formAction: deleteStudentEnrollmentAction,
    submitVariant: "destructive",
    title: "Hapus pengguna?",
  },
  unban: {
    actionLabel: "Pulihkan pengguna",
    confirmation: "reactivate",
    description: "Akses siswa akan dipulihkan. Sesi yang sudah ada tetap dicabut.",
    dialogVariant: "info",
    formAction: reactivateStudentEnrollmentAction,
    submitVariant: "brand",
    title: "Pulihkan pengguna?",
  },
} as const;

function StudentAccountActionButtons({
  compact,
  onSelect,
  showPasswordAction,
  status,
  returnPath,
  studentId,
}: {
  compact: boolean;
  onSelect: (action: PendingAction) => void;
  returnPath: string;
  showPasswordAction: boolean;
  status: UserStatus;
  studentId: string;
}) {
  return (
    <div className={cn("mt-8 flex w-full max-w-sm flex-col items-start gap-2", compact && "mt-3 max-w-none gap-1")}>
      {showPasswordAction ? <StudentPasswordDialog returnPath={returnPath} studentId={studentId} /> : null}
      {status === "active" ? (
        <Button className={compact ? "w-full" : "justify-start"} onClick={() => onSelect("ban")} size="default" type="button" variant="dangerOutline">Nonaktifkan pengguna</Button>
      ) : status === "disabled" ? (
        <Button className={cn(compact ? "w-full" : "justify-start", "text-primary-700 hover:text-primary-800")} onClick={() => onSelect("unban")} size="default" type="button" variant="ghost">Pulihkan pengguna</Button>
      ) : null}
      <Button className={compact ? "w-full" : "justify-start"} onClick={() => onSelect("delete")} size="default" type="button" variant="dangerOutline">Hapus pengguna</Button>
    </div>
  );
}

function StudentAccountConfirmation({
  directoryQuery,
  onClose,
  pendingAction,
  returnPath,
  studentId,
}: {
  directoryQuery: string;
  onClose: () => void;
  pendingAction: PendingAction | null;
  returnPath: string;
  studentId: string;
}) {
  if (!pendingAction) return null;

  const copy = pendingActionCopy[pendingAction];

  return (
    <AlertDialog onOpenChange={(open) => { if (!open) onClose(); }} open>
      <AlertDialogContent variant={copy.dialogVariant}>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription className="text-secondary-600">{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <form action={copy.formAction}>
          <input name="confirmation" type="hidden" value={copy.confirmation} />
          <input name="directoryQuery" type="hidden" value={directoryQuery} />
          <input name="returnPath" type="hidden" value={returnPath} />
          <input name="userId" type="hidden" value={studentId} />
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Batal</AlertDialogCancel>
            <SubmitButton pendingLabel={`${copy.actionLabel}…`} type="submit" variant={copy.submitVariant}>{copy.actionLabel}</SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function StudentAccountActions({
  compact = false,
  directoryQuery = "",
  returnPath,
  showPasswordAction = true,
  status,
  studentId,
}: {
  compact?: boolean;
  directoryQuery?: string;
  returnPath: string;
  showPasswordAction?: boolean;
  status: UserStatus;
  studentId: string;
}) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  return (
    <>
      <StudentAccountActionButtons compact={compact} onSelect={setPendingAction} returnPath={returnPath} showPasswordAction={showPasswordAction} status={status} studentId={studentId} />
      <StudentAccountConfirmation directoryQuery={directoryQuery} onClose={() => setPendingAction(null)} pendingAction={pendingAction} returnPath={returnPath} studentId={studentId} />
    </>
  );
}

export { StudentAccountActions };

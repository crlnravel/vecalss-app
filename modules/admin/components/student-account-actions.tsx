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
import type { UserStatus } from "@/generated/prisma/client";
import { SubmitButton } from "@/modules/auth/components/submit-button";

import { StudentPasswordDialog } from "./student-password-dialog";
import {
  deleteStudentEnrollmentAction,
  deactivateStudentEnrollmentAction,
  reactivateStudentEnrollmentAction,
} from "../actions";

type PendingAction = "ban" | "delete" | "unban";

function StudentAccountActions({
  returnPath,
  status,
  studentId,
}: {
  returnPath: string;
  status: UserStatus;
  studentId: string;
}) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const isBan = pendingAction === "ban";
  const isDelete = pendingAction === "delete";
  const isUnban = pendingAction === "unban";
  const formAction = isBan
    ? deactivateStudentEnrollmentAction
    : isUnban
      ? reactivateStudentEnrollmentAction
      : deleteStudentEnrollmentAction;
  const confirmation = isBan ? "deactivate" : isUnban ? "reactivate" : "delete";
  const title = isBan ? "Ban User?" : isUnban ? "Unban User?" : "Delete User?";
  const description = isBan
    ? "This will disable access and revoke the student’s active sessions."
    : isUnban
      ? "This will restore access for this student. Existing sessions will remain revoked."
      : "This will remove the student from the directory and revoke access to the account.";
  const actionLabel = isBan ? "Ban User" : isUnban ? "Unban User" : "Delete User";

  return (
    <>
      <div className="mt-8 flex w-full max-w-sm flex-col items-start gap-2">
        <StudentPasswordDialog returnPath={returnPath} studentId={studentId} />

        {status === "active" ? (
          <button
            className="inline-flex min-h-11 items-center text-sm font-semibold text-danger-700 transition-colors hover:text-danger-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger-300"
            onClick={() => setPendingAction("ban")}
            type="button"
          >
            Ban User
          </button>
        ) : status === "disabled" ? (
          <button
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
            onClick={() => setPendingAction("unban")}
            type="button"
          >
            Unban User
          </button>
        ) : null}

        <button
          className="inline-flex min-h-11 items-center text-sm font-semibold text-danger-700 transition-colors hover:text-danger-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger-300"
          onClick={() => setPendingAction("delete")}
          type="button"
        >
          Delete User
        </button>
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null);
          }
        }}
        open={pendingAction !== null}
      >
        <AlertDialogContent variant={isDelete ? "danger" : isBan ? "warning" : "info"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription className="text-secondary-600">{description}</AlertDialogDescription>
          </AlertDialogHeader>

          <form action={formAction}>
            <input name="confirmation" type="hidden" value={confirmation} />
            <input name="returnPath" type="hidden" value={returnPath} />
            <input name="userId" type="hidden" value={studentId} />
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <SubmitButton
                pendingLabel={`${actionLabel}…`}
                type="submit"
                variant={isDelete || isBan ? "destructive" : "brand"}
              >
                {actionLabel}
              </SubmitButton>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { StudentAccountActions };

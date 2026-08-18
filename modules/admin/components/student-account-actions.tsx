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
      <div className={cn("mt-8 flex w-full max-w-sm flex-col items-start gap-2", compact && "mt-3 max-w-none gap-1")}>
        {showPasswordAction ? <StudentPasswordDialog returnPath={returnPath} studentId={studentId} /> : null}

        {status === "active" ? (
          <Button
            className={compact ? "w-full" : "justify-start"}
            onClick={() => setPendingAction("ban")}
            size="default"
            type="button"
            variant="dangerOutline"
          >
            Ban User
          </Button>
        ) : status === "disabled" ? (
          <Button
            className={cn(compact ? "w-full" : "justify-start", "text-primary-700 hover:text-primary-800")}
            onClick={() => setPendingAction("unban")}
            size="default"
            type="button"
            variant="ghost"
          >
            Unban User
          </Button>
        ) : null}

        <Button
          className={compact ? "w-full" : "justify-start"}
          onClick={() => setPendingAction("delete")}
          size="default"
          type="button"
          variant="dangerOutline"
        >
          Delete User
        </Button>
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
            <input name="directoryQuery" type="hidden" value={directoryQuery} />
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

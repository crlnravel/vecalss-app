"use client";

import { useActionState, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";
import { changeStudentEnrollmentPasswordAction } from "@/modules/admin/actions";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";
import { SubmitButton } from "@/modules/auth/components/submit-button";

function StudentPasswordForm({
  returnPath,
  studentId,
}: {
  returnPath: string;
  studentId: string;
}) {
  const [state, formAction] = useActionState(
    changeStudentEnrollmentPasswordAction,
    EMPTY_FORM_STATE,
  );

  return (
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>Ubah password</AlertDialogTitle>
      </AlertDialogHeader>

      <form action={formAction} className="space-y-5">
        <input name="returnPath" type="hidden" value={returnPath} />
        <input name="userId" type="hidden" value={studentId} />

        {state.message ? (
          <p aria-live="assertive" className="text-sm leading-6 text-student-status-danger-fg" role="alert">
            {state.message}
          </p>
        ) : null}

        <Field>
          <FieldLabel htmlFor="student-new-password">Password baru</FieldLabel>
          <FieldInput
            aria-describedby={state.fieldErrors?.password ? "student-new-password-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.password)}
            autoComplete="new-password"
            autoFocus
            id="student-new-password"
            name="password"
            required
            type="password"
          />
          <FieldError error={state.fieldErrors?.password} id="student-new-password-error" />
        </Field>

        <Field>
          <FieldLabel htmlFor="student-confirm-password">Konfirmasi password</FieldLabel>
          <FieldInput
            aria-describedby={state.fieldErrors?.confirmPassword ? "student-confirm-password-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
            autoComplete="new-password"
            id="student-confirm-password"
            name="confirmPassword"
            required
            type="password"
          />
          <FieldError error={state.fieldErrors?.confirmPassword} id="student-confirm-password-error" />
        </Field>

        <AlertDialogFooter>
          <AlertDialogCancel type="button">Batal</AlertDialogCancel>
          <SubmitButton pendingLabel="Memperbarui…" type="submit" variant="brand">
            Konfirmasi
          </SubmitButton>
        </AlertDialogFooter>
      </form>
    </AlertDialogContent>
  );
}

function StudentPasswordDialog({
  returnPath,
  studentId,
}: {
  returnPath: string;
  studentId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="default"
        variant="ghost"
      >
         Ubah password
      </Button>

      <AlertDialog onOpenChange={setOpen} open={open}>
        {open ? <StudentPasswordForm returnPath={returnPath} studentId={studentId} /> : null}
      </AlertDialog>
    </>
  );
}

export { StudentPasswordDialog };

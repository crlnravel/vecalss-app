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
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
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
        <AlertDialogTitle>Change Password</AlertDialogTitle>
      </AlertDialogHeader>

      <form action={formAction} className="space-y-5">
        <input name="returnPath" type="hidden" value={returnPath} />
        <input name="userId" type="hidden" value={studentId} />

        {state.message ? (
          <p aria-live="assertive" className="text-sm leading-6 text-danger-700" role="alert">
            {state.message}
          </p>
        ) : null}

        <Field>
          <FieldLabel htmlFor="student-new-password">New password</FieldLabel>
          <FieldInput
            aria-invalid={Boolean(state.fieldErrors?.password)}
            autoComplete="new-password"
            autoFocus
            id="student-new-password"
            name="password"
            required
            type="password"
          />
          {state.fieldErrors?.password ? (
            <p className="text-sm text-danger-700">{state.fieldErrors.password}</p>
          ) : null}
        </Field>

        <Field>
          <FieldLabel htmlFor="student-confirm-password">Confirm password</FieldLabel>
          <FieldInput
            aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
            autoComplete="new-password"
            id="student-confirm-password"
            name="confirmPassword"
            required
            type="password"
          />
          {state.fieldErrors?.confirmPassword ? (
            <p className="text-sm text-danger-700">{state.fieldErrors.confirmPassword}</p>
          ) : null}
        </Field>

        <AlertDialogFooter>
          <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
          <SubmitButton pendingLabel="Updating…" type="submit" variant="brand">
            Confirm
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
      <button
        className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-secondary-900 transition-colors hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
        onClick={() => setOpen(true)}
        type="button"
      >
        Change Password
      </button>

      <AlertDialog onOpenChange={setOpen} open={open}>
        {open ? <StudentPasswordForm returnPath={returnPath} studentId={studentId} /> : null}
      </AlertDialog>
    </>
  );
}

export { StudentPasswordDialog };

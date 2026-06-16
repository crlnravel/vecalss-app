"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FieldInput, FieldLabel } from "@/components/ui/field";

import { resetPasswordAction } from "../actions";
import { EMPTY_FORM_STATE } from "../form-state";
import { FormNotice } from "./form-notice";
import { SubmitButton } from "./submit-button";

function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPasswordAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="space-y-5">
      <input name="token" type="hidden" value={token} />

      {state.message ? <FormNotice tone="danger">{state.message}</FormNotice> : null}

      <Field>
        <FieldLabel htmlFor="reset-password">New password</FieldLabel>
        <FieldInput
          autoComplete="new-password"
          id="reset-password"
          name="password"
          placeholder="At least 8 characters"
          required
          type="password"
        />
        {state.fieldErrors?.password ? (
          <p className="text-sm text-danger-700">{state.fieldErrors.password}</p>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="reset-password-confirmation">Confirm password</FieldLabel>
        <FieldInput
          autoComplete="new-password"
          id="reset-password-confirmation"
          name="confirmPassword"
          placeholder="Repeat your new password"
          required
          type="password"
        />
        {state.fieldErrors?.confirmPassword ? (
          <p className="text-sm text-danger-700">{state.fieldErrors.confirmPassword}</p>
        ) : null}
      </Field>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Link className="text-sm font-medium text-primary-700 hover:text-primary-800" href="/login">
          Back to login
        </Link>
        <SubmitButton pendingLabel="Updating password..." size="lg" type="submit" variant="brand">
          Save new password
        </SubmitButton>
      </div>
    </form>
  );
}

export { ResetPasswordForm };

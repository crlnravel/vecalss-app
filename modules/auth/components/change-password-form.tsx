"use client";

import { useActionState } from "react";

import { Field, FieldInput, FieldLabel } from "@/components/ui/field";

import { changePasswordAction } from "../actions";
import { EMPTY_FORM_STATE } from "../form-state";
import { FormNotice } from "./form-notice";
import { SubmitButton } from "./submit-button";

function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="space-y-5">
      {state.message ? <FormNotice tone="danger">{state.message}</FormNotice> : null}

      <Field>
        <FieldLabel htmlFor="change-password">New password</FieldLabel>
        <FieldInput
          autoComplete="new-password"
          id="change-password"
          name="password"
          placeholder="Choose a strong password"
          required
          type="password"
        />
        {state.fieldErrors?.password ? (
          <p className="text-sm text-danger-700">{state.fieldErrors.password}</p>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="change-password-confirmation">Confirm password</FieldLabel>
        <FieldInput
          autoComplete="new-password"
          id="change-password-confirmation"
          name="confirmPassword"
          placeholder="Repeat your new password"
          required
          type="password"
        />
        {state.fieldErrors?.confirmPassword ? (
          <p className="text-sm text-danger-700">{state.fieldErrors.confirmPassword}</p>
        ) : null}
      </Field>

      <SubmitButton className="w-full sm:w-auto" pendingLabel="Updating password..." size="lg" type="submit" variant="brand">
        Save password and continue
      </SubmitButton>
    </form>
  );
}

export { ChangePasswordForm };

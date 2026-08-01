"use client";

import { useActionState } from "react";

import { Field, FieldInput, FieldLabel } from "@/components/ui/field";

import { changePasswordAction } from "../actions";
import { EMPTY_FORM_STATE } from "../form-state";
import { FormNotice } from "./form-notice";
import { SubmitButton } from "./submit-button";

function ChangePasswordForm() {
  const [state, formAction] = useActionState(
    changePasswordAction,
    EMPTY_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.message ? (
        <FormNotice label="Maaf" tone="danger">
          {state.message}
        </FormNotice>
      ) : null}

      <Field>
        <FieldLabel htmlFor="change-password">Kata sandi baru</FieldLabel>
        <FieldInput
          autoComplete="new-password"
          id="change-password"
          name="password"
          placeholder="Buat kata sandi yang kuat"
          required
          type="password"
        />
        {state.fieldErrors?.password ? (
          <p className="text-sm text-danger-700">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="change-password-confirmation">
          Konfirmasi kata sandi
        </FieldLabel>
        <FieldInput
          autoComplete="new-password"
          id="change-password-confirmation"
          name="confirmPassword"
          placeholder="Ulangi kata sandi baru Anda"
          required
          type="password"
        />
        {state.fieldErrors?.confirmPassword ? (
          <p className="text-sm text-danger-700">
            {state.fieldErrors.confirmPassword}
          </p>
        ) : null}
      </Field>

      <SubmitButton
        className="w-full sm:w-auto"
        pendingLabel="Memperbarui kata sandi..."
        size="lg"
        type="submit"
        variant="brand"
      >
        Simpan
      </SubmitButton>
    </form>
  );
}

export { ChangePasswordForm };

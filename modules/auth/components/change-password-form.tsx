"use client";

import { useActionState } from "react";

import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { useActionToast } from "@/components/ui/use-action-toast";

import { changePasswordAction } from "../actions";
import { EMPTY_FORM_STATE } from "../form-state";
import { PASSWORD_REQUIREMENTS_COPY } from "../password-copy";
import { FormNotice } from "./form-notice";
import { SubmitButton } from "./submit-button";

function ChangePasswordForm() {
  const [state, formAction] = useActionState(
    changePasswordAction,
    EMPTY_FORM_STATE,
  );
  const keepMessageInline = useActionToast(state);

  return (
    <form action={formAction} className="space-y-5">
      {state.message && keepMessageInline ? (
        <FormNotice label="Perlu perhatian" tone="danger">
          {state.message}
        </FormNotice>
      ) : null}

      <Field>
        <FieldLabel htmlFor="change-password">Kata sandi baru</FieldLabel>
        <FieldInput
          autoComplete="new-password"
          id="change-password"
          name="password"
          placeholder="Minimal 8 karakter"
          required
          type="password"
        />
        <p className="text-sm text-secondary-600">{PASSWORD_REQUIREMENTS_COPY}</p>
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
          placeholder="Ulangi kata sandi baru"
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
        pendingLabel="Menyimpan kata sandi..."
        size="lg"
        type="submit"
        variant="brand"
      >
        Simpan kata sandi baru
      </SubmitButton>
    </form>
  );
}

export { ChangePasswordForm };

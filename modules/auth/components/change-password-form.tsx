"use client";

import { useActionState } from "react";

import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";
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
        <FieldLabel htmlFor="change-password" required>Kata sandi baru</FieldLabel>
        <FieldInput
          aria-describedby={state.fieldErrors?.password ? "change-password-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          autoComplete="new-password"
          id="change-password"
          name="password"
          placeholder="Minimal 8 karakter"
          required
          type="password"
        />
        <p className="text-sm text-secondary-600">{PASSWORD_REQUIREMENTS_COPY}</p>
        <FieldError error={state.fieldErrors?.password} id="change-password-error" />
      </Field>

      <Field>
        <FieldLabel htmlFor="change-password-confirmation" required>
          Konfirmasi kata sandi
        </FieldLabel>
        <FieldInput
          autoComplete="new-password"
          id="change-password-confirmation"
          aria-describedby={state.fieldErrors?.confirmPassword ? "change-password-confirmation-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
          name="confirmPassword"
          placeholder="Ulangi kata sandi baru"
          required
          type="password"
        />
        <FieldError error={state.fieldErrors?.confirmPassword} id="change-password-confirmation-error" />
      </Field>

      <SubmitButton
        className="w-full sm:w-auto"
        pendingLabel="Menyimpan kata sandi..."
        size="lg"
        type="submit"
        variant="default"
      >
        Simpan kata sandi baru
      </SubmitButton>
    </form>
  );
}

export { ChangePasswordForm };

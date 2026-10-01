"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";
import { useActionToast } from "@/components/ui/use-action-toast";
import type { LoginAudience } from "@/lib/auth/types";

import { resetPasswordAction } from "../actions";
import { EMPTY_FORM_STATE } from "../form-state";
import { PASSWORD_REQUIREMENTS_COPY } from "../password-copy";
import { FormNotice } from "./form-notice";
import { SubmitButton } from "./submit-button";

function ResetPasswordForm({
  audience,
  backHref,
  token,
}: {
  audience: LoginAudience;
  backHref: string;
  token: string;
}) {
  const [state, formAction] = useActionState(resetPasswordAction, EMPTY_FORM_STATE);
  const keepMessageInline = useActionToast(state);

  return (
    <form action={formAction} className="space-y-5">
      <input name="audience" type="hidden" value={audience} />
      <input name="token" type="hidden" value={token} />

      {state.message && keepMessageInline ? <FormNotice tone="danger">{state.message}</FormNotice> : null}

      <Field>
        <FieldLabel htmlFor="reset-password" required>Kata sandi baru</FieldLabel>
        <FieldInput
          aria-describedby={state.fieldErrors?.password ? "reset-password-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          autoComplete="new-password"
          id="reset-password"
          name="password"
          placeholder="Minimal 8 karakter"
          required
          type="password"
        />
        <p className="text-sm text-secondary-600">{PASSWORD_REQUIREMENTS_COPY}</p>
        <FieldError error={state.fieldErrors?.password} id="reset-password-error" />
      </Field>

      <Field>
        <FieldLabel htmlFor="reset-password-confirmation" required>Konfirmasi kata sandi</FieldLabel>
        <FieldInput
          autoComplete="new-password"
          id="reset-password-confirmation"
          aria-describedby={state.fieldErrors?.confirmPassword ? "reset-password-confirmation-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
          name="confirmPassword"
          placeholder="Ulangi kata sandi baru"
          required
          type="password"
        />
        <FieldError error={state.fieldErrors?.confirmPassword} id="reset-password-confirmation-error" />
      </Field>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary-700 hover:text-primary-800"
          href={backHref}
        >
          Kembali ke halaman masuk
        </Link>
        <SubmitButton pendingLabel="Menyimpan kata sandi..." size="lg" type="submit" variant="default">
          Simpan kata sandi baru
        </SubmitButton>
      </div>
    </form>
  );
}

export { ResetPasswordForm };

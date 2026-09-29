"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
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
        <FieldLabel htmlFor="reset-password">Kata sandi baru</FieldLabel>
        <FieldInput
          autoComplete="new-password"
          id="reset-password"
          name="password"
          placeholder="Minimal 8 karakter"
          required
          type="password"
        />
        <p className="text-sm text-secondary-600">{PASSWORD_REQUIREMENTS_COPY}</p>
        {state.fieldErrors?.password ? (
          <p className="text-sm text-danger-700">{state.fieldErrors.password}</p>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="reset-password-confirmation">Konfirmasi kata sandi</FieldLabel>
        <FieldInput
          autoComplete="new-password"
          id="reset-password-confirmation"
          name="confirmPassword"
          placeholder="Ulangi kata sandi baru"
          required
          type="password"
        />
        {state.fieldErrors?.confirmPassword ? (
          <p className="text-sm text-danger-700">{state.fieldErrors.confirmPassword}</p>
        ) : null}
      </Field>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary-700 hover:text-primary-800"
          href={backHref}
        >
          Kembali ke halaman masuk
        </Link>
        <SubmitButton pendingLabel="Menyimpan kata sandi..." size="lg" type="submit" variant="brand">
          Simpan kata sandi baru
        </SubmitButton>
      </div>
    </form>
  );
}

export { ResetPasswordForm };

"use client";

import Link from "next/link";
import { useActionState } from "react";

import { useActionToast } from "@/components/ui/use-action-toast";
import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";

import { EMPTY_FORM_STATE } from "../form-state";
import { verifyEmailAction } from "../registration-actions";
import { PASSWORD_REQUIREMENTS_COPY } from "../password-copy";
import { FormNotice } from "./form-notice";
import { SubmitButton } from "./submit-button";

function VerifyEmailForm({
  referral,
  resendHref,
  returnTo,
  token,
}: {
  referral?: string | null;
  resendHref: string;
  returnTo?: string | null;
  token: string;
}) {
  const [state, formAction] = useActionState(verifyEmailAction, EMPTY_FORM_STATE);
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-5">
      <input name="token" type="hidden" value={token} />
      {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
      {referral ? <input name="ref" type="hidden" value={referral} /> : null}

      <Field>
        <FieldLabel htmlFor="verify-password" required>Kata sandi</FieldLabel>
        <FieldInput
          aria-describedby={state.fieldErrors?.password ? "verify-password-error verify-password-help" : "verify-password-help"}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          autoComplete="new-password"
          id="verify-password"
          name="password"
          placeholder="Buat kata sandi"
          required
          type="password"
        />
        <p className="text-sm text-secondary-600" id="verify-password-help">{PASSWORD_REQUIREMENTS_COPY}</p>
        <FieldError error={state.fieldErrors?.password} id="verify-password-error" />
      </Field>

      {state.status === "error" && state.message ? (
        <FormNotice showLabel={false} tone="danger">
          {state.message}{" "}
          <Link className="font-semibold underline underline-offset-4" href={resendHref}>
            Kirim ulang tautan
          </Link>
          .
        </FormNotice>
      ) : null}

      <SubmitButton className="w-full" pendingLabel="Memverifikasi..." size="lg" type="submit" variant="default">
        Simpan kata sandi dan verifikasi email
      </SubmitButton>
    </form>
  );
}

export { VerifyEmailForm };

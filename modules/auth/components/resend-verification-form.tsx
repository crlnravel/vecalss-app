"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";
import { useActionToast } from "@/components/ui/use-action-toast";

import { EMPTY_FORM_STATE } from "../form-state";
import { resendVerificationAction } from "../registration-actions";
import { FormNotice } from "./form-notice";
import { SubmitButton } from "./submit-button";

function ResendVerificationForm({
  loginHref,
  referral,
  returnTo,
}: {
  loginHref: string;
  referral?: string | null;
  returnTo?: string | null;
}) {
  const [state, formAction] = useActionState(resendVerificationAction, EMPTY_FORM_STATE);
  // The answer tells people to check their inbox, so it stays on the page instead of fading away as a toast.
  const keepMessageInline = useActionToast(state.status === "success" ? { ...state, message: undefined } : state);

  return (
    <form action={formAction} className="space-y-5">
      {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
      {referral ? <input name="ref" type="hidden" value={referral} /> : null}

      {state.message && (keepMessageInline || state.status === "success") ? (
        <FormNotice
          label={state.status === "success" ? "Periksa email" : undefined}
          tone={state.status === "error" ? "danger" : "success"}
        >
          {state.message}
        </FormNotice>
      ) : null}

      {state.verifyUrl ? (
        <FormNotice tone="neutral">
          <p className="font-medium">Tautan verifikasi (hanya tampil di komputer pengembang)</p>
          <a className="mt-1 inline-flex min-h-11 items-center break-all text-sm font-semibold text-primary-700 underline underline-offset-4" href={state.verifyUrl}>
            Buka tautan verifikasi
          </a>
        </FormNotice>
      ) : null}

      <Field>
        <FieldLabel htmlFor="resend-email" required>Email</FieldLabel>
        <FieldInput
          aria-describedby={state.fieldErrors?.email ? "resend-email-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          autoComplete="email"
          defaultValue={state.fields?.email ?? ""}
          id="resend-email"
          name="email"
          placeholder="nama@email.com"
          required
          type="email"
        />
        <FieldError error={state.fieldErrors?.email} id="resend-email-error" />
      </Field>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary-700 hover:text-primary-800"
          href={loginHref}
        >
          Kembali ke halaman masuk
        </Link>
        <SubmitButton pendingLabel="Mengirim tautan..." size="lg" type="submit" variant="default">
          Kirim ulang tautan
        </SubmitButton>
      </div>
    </form>
  );
}

export { ResendVerificationForm };

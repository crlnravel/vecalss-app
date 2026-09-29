"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { useActionToast } from "@/components/ui/use-action-toast";
import type { LoginAudience } from "@/lib/auth/types";

import { forgotPasswordAction } from "../actions";
import { EMPTY_FORM_STATE } from "../form-state";
import { FormNotice } from "./form-notice";
import { SubmitButton } from "./submit-button";

function ForgotPasswordForm({
  audience,
  backHref,
  defaultEmail,
}: {
  audience: LoginAudience;
  backHref: string;
  defaultEmail?: string;
}) {
  const [state, formAction] = useActionState(forgotPasswordAction, EMPTY_FORM_STATE);
  const keepMessageInline = useActionToast(state);

  return (
    <form action={formAction} className="space-y-5">
      <input name="audience" type="hidden" value={audience} />

      {state.message && keepMessageInline ? (
        <FormNotice
          tone={state.status === "error" ? "danger" : state.resetUrl ? "success" : "neutral"}
        >
          {state.message}
        </FormNotice>
      ) : null}

      {state.resetUrl ? (
        <FormNotice tone="neutral">
          <p className="font-medium">Tautan pengaturan ulang kata sandi</p>
          <a className="mt-1 inline-flex min-h-11 items-center break-all text-sm font-semibold text-primary-700 underline underline-offset-4" href={state.resetUrl}>
            Buka tautan pengaturan ulang
          </a>
        </FormNotice>
      ) : null}

      <Field>
        <FieldLabel htmlFor="forgot-email">Email</FieldLabel>
        <FieldInput
          autoComplete="email"
          defaultValue={state.fields?.email ?? defaultEmail ?? ""}
          id="forgot-email"
          name="email"
          placeholder="nama@email.com"
          required
          type="email"
        />
        {state.fieldErrors?.email ? (
          <p className="text-sm text-danger-700">{state.fieldErrors.email}</p>
        ) : null}
      </Field>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary-700 hover:text-primary-800"
          href={backHref}
        >
          Kembali ke halaman masuk
        </Link>
        <SubmitButton pendingLabel="Menyiapkan tautan..." size="lg" type="submit" variant="brand">
          Minta tautan pengaturan ulang
        </SubmitButton>
      </div>
    </form>
  );
}

export { ForgotPasswordForm };

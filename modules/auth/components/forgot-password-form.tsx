"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
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

  return (
    <form action={formAction} className="space-y-5">
      <input name="audience" type="hidden" value={audience} />

      {state.message ? (
        <FormNotice tone={state.status === "success" ? "success" : "danger"}>
          {state.message}
        </FormNotice>
      ) : null}

      {state.resetUrl ? (
        <FormNotice tone="neutral">
          <p className="font-medium">Development reset link</p>
          <p className="mt-1 break-all text-sm">{state.resetUrl}</p>
        </FormNotice>
      ) : null}

      <Field>
        <FieldLabel htmlFor="forgot-email">Account email</FieldLabel>
        <FieldInput
          autoComplete="email"
          defaultValue={state.fields?.email ?? defaultEmail ?? ""}
          id="forgot-email"
          name="email"
          placeholder={
            audience === "admin"
              ? "admin@vecalss.id"
              : audience === "tutor"
                ? "kapten@vecalss.id"
                : "student@vecalss.id"
          }
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
          Back to login
        </Link>
        <SubmitButton pendingLabel="Preparing link..." size="lg" type="submit" variant="brand">
          Send reset instructions
        </SubmitButton>
      </div>
    </form>
  );
}

export { ForgotPasswordForm };

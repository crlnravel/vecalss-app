"use client";

import Link from "next/link";
import { useActionState } from "react";

import { fieldControlClassName, Field, FieldInput, FieldLabel } from "@/components/ui/field";

import { loginAction } from "../actions";
import { EMPTY_FORM_STATE } from "../form-state";
import { FormNotice } from "./form-notice";
import { SubmitButton } from "./submit-button";

function LoginForm({
  notice,
  registerUrl,
}: {
  notice?: string | null;
  registerUrl: string;
}) {
  const [state, formAction] = useActionState(loginAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="space-y-5">
      {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
      {state.message ? <FormNotice tone="danger">{state.message}</FormNotice> : null}

      <Field>
        <FieldLabel htmlFor="login-email">Email</FieldLabel>
        <FieldInput
          autoComplete="email"
          defaultValue={state.fields?.email ?? ""}
          id="login-email"
          name="email"
          placeholder="student@vecalss.id"
          required
          type="email"
        />
        {state.fieldErrors?.email ? (
          <p className="text-sm text-danger-700">{state.fieldErrors.email}</p>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="login-password">Password</FieldLabel>
        <FieldInput
          autoComplete="current-password"
          id="login-password"
          name="password"
          placeholder="Enter your password"
          required
          type="password"
        />
        {state.fieldErrors?.password ? (
          <p className="text-sm text-danger-700">{state.fieldErrors.password}</p>
        ) : null}
      </Field>

      <div className="flex flex-col gap-3 pt-2 md:flex-row md:items-center md:justify-between">
        <Link className="text-sm font-medium text-primary-700 hover:text-primary-800" href="/forgot-password">
          Forgot your password?
        </Link>
        <div className="flex flex-col gap-3 md:flex-row">
          <Link
            className={`${fieldControlClassName} inline-flex min-h-[58px] items-center justify-center px-6 py-3 text-base font-medium`}
            href={registerUrl}
          >
            Register
          </Link>
          <SubmitButton pendingLabel="Signing in..." size="lg" type="submit" variant="brand">
            Login to Vecalss
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

export { LoginForm };

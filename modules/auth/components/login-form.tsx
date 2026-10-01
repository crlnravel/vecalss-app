"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";
import { ToastOnMount } from "@/components/ui/toast-on-mount";
import { useActionToast } from "@/components/ui/use-action-toast";

import { loginAction } from "../actions";
import { EMPTY_FORM_STATE } from "../form-state";
import { FormNotice } from "./form-notice";
import { SubmitButton } from "./submit-button";

type LoginNotice = {
  text: string;
};

function LoginForm({
  notice,
  returnTo,
  registerUrl,
}: {
  notice?: LoginNotice | null;
  returnTo?: string | null;
  registerUrl: string;
}) {
  const [state, formAction] = useActionState(loginAction, EMPTY_FORM_STATE);
  const keepMessageInline = useActionToast(state);

  return (
    <form action={formAction} className="space-y-5">
      {returnTo ? (
        <input name="returnTo" type="hidden" value={returnTo} />
      ) : null}

      {notice ? <ToastOnMount message={notice.text} variant="success" /> : null}
      {state.message && keepMessageInline ? (
        <FormNotice showLabel={false} tone="danger">
          {state.message}
        </FormNotice>
      ) : null}

      <Field>
        <FieldLabel htmlFor="login-email" required>Email</FieldLabel>
        <FieldInput
          autoComplete="email"
          aria-describedby={state.fieldErrors?.email ? "login-email-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          defaultValue={state.fields?.email ?? ""}
          id="login-email"
          name="email"
          placeholder="nama@email.com"
          required
          type="email"
        />
        <FieldError error={state.fieldErrors?.email} id="login-email-error" />
      </Field>

      <Field>
        <FieldLabel htmlFor="login-password" required>Kata sandi</FieldLabel>
        <FieldInput
          autoComplete="current-password"
          aria-describedby={state.fieldErrors?.password ? "login-password-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          id="login-password"
          name="password"
          placeholder="Masukkan kata sandi"
          required
          type="password"
        />
        <FieldError error={state.fieldErrors?.password} id="login-password-error" />
      </Field>

      <div className="flex items-center justify-end pt-1">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-700 hover:text-primary-800"
          href="/forgot-password"
        >
          Lupa kata sandi?
        </Link>
      </div>

      <SubmitButton
        className="w-full"
        pendingLabel="Sedang masuk..."
        size="lg"
        type="submit"
        variant="default"
      >
        Masuk
      </SubmitButton>

      <p className="text-center text-sm leading-6 text-secondary-600">
        Belum punya akun?{" "}
        <Link
          className="font-semibold text-primary-700 hover:text-primary-800"
          href={registerUrl}
        >
          Buat akun
        </Link>
        .
      </p>
    </form>
  );
}

export { LoginForm };

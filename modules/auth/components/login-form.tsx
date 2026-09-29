"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
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
        <FieldLabel htmlFor="login-email">Email</FieldLabel>
        <FieldInput
          autoComplete="email"
          className="min-h-[54px] rounded-xl border-transparent bg-secondary-50 px-5 text-base shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)] placeholder:text-secondary-400 focus-visible:bg-white"
          defaultValue={state.fields?.email ?? ""}
          id="login-email"
          name="email"
          placeholder="nama@email.com"
          required
          type="email"
        />
        {state.fieldErrors?.email ? (
          <p className="text-sm text-danger-700">{state.fieldErrors.email}</p>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="login-password">Kata sandi</FieldLabel>
        <FieldInput
          autoComplete="current-password"
          className="min-h-[54px] rounded-xl border-transparent bg-secondary-50 px-5 text-base shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)] placeholder:text-secondary-400 focus-visible:bg-white"
          id="login-password"
          name="password"
          placeholder="Masukkan kata sandi"
          required
          type="password"
        />
        {state.fieldErrors?.password ? (
          <p className="text-sm text-danger-700">
            {state.fieldErrors.password}
          </p>
        ) : null}
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
        className="min-h-[54px] w-full rounded-xl text-base font-semibold shadow-[0_16px_30px_-22px_color-mix(in_oklab,var(--voyage-deep)_70%,transparent)]"
        pendingLabel="Sedang masuk..."
        size="lg"
        type="submit"
        variant="brand"
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

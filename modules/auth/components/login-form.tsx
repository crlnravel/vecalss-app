"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FieldInput, FieldLabel } from "@/components/ui/field";

import { loginAction } from "../actions";
import { EMPTY_FORM_STATE } from "../form-state";
import { FormNotice } from "./form-notice";
import { SubmitButton } from "./submit-button";

type LoginNotice = {
  compact?: boolean;
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

  return (
    <form action={formAction} className="space-y-5">
      {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}

      {notice ? (
        <FormNotice compact={notice.compact} tone="success">
          {notice.text}
        </FormNotice>
      ) : null}
      {state.message ? (
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
          placeholder="email@vecalss.id"
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
          className="min-h-[54px] rounded-xl border-transparent bg-secondary-50 px-5 text-base shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)] placeholder:text-secondary-400 focus-visible:bg-white"
          id="login-password"
          name="password"
          placeholder="Masukkan password"
          required
          type="password"
        />
        {state.fieldErrors?.password ? (
          <p className="text-sm text-danger-700">{state.fieldErrors.password}</p>
        ) : null}
      </Field>

      <div className="flex items-center justify-end pt-1">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-700 hover:text-primary-800"
          href="/forgot-password"
        >
          Lupa password?
        </Link>
      </div>

      <SubmitButton
        className="min-h-[54px] w-full rounded-xl text-base font-semibold shadow-[0_16px_30px_-22px_color-mix(in_oklab,var(--voyage-deep)_70%,transparent)]"
        pendingLabel="Memproses..."
        size="lg"
        type="submit"
        variant="brand"
      >
        Masuk
      </SubmitButton>

      <p className="text-center text-sm leading-6 text-secondary-600">
        Butuh akun? Daftar melalui{" "}
        <Link
          className="font-semibold text-primary-700 hover:text-primary-800"
          href={registerUrl}
        >
          formulir pendaftaran
        </Link>
        .
      </p>
    </form>
  );
}

export { LoginForm };

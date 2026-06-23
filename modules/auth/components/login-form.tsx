"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import type { LoginAudience } from "@/lib/auth/types";

import { loginAdminAction, loginStudentAction } from "../actions";
import { EMPTY_FORM_STATE } from "../form-state";
import { FormNotice } from "./form-notice";
import { SubmitButton } from "./submit-button";

function LoginForm({
  audience,
  notice,
  registerUrl,
}: {
  audience: LoginAudience;
  notice?: string | null;
  registerUrl: string;
}) {
  const [state, formAction] = useActionState(
    audience === "admin" ? loginAdminAction : loginStudentAction,
    EMPTY_FORM_STATE,
  );
  const forgotPasswordHref = audience === "admin" ? "/forgot-password?audience=admin" : "/forgot-password";
  const isAdminLogin = audience === "admin";

  return (
    <form action={formAction} className="space-y-5">
      <input name="audience" type="hidden" value={audience} />

      {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
      {state.message ? <FormNotice tone="danger">{state.message}</FormNotice> : null}

      <Field>
        <FieldLabel htmlFor="login-email">Email</FieldLabel>
        <FieldInput
          autoComplete="email"
          className="min-h-[54px] rounded-[12px] border-transparent bg-secondary-50 px-5 text-base shadow-[inset_0_0_0_1px_rgba(1,76,56,0.08)] placeholder:text-secondary-400 focus-visible:bg-white"
          defaultValue={state.fields?.email ?? ""}
          id="login-email"
          name="email"
          placeholder={isAdminLogin ? "admin@vecalss.id" : "student@vecalss.id"}
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
          className="min-h-[54px] rounded-[12px] border-transparent bg-secondary-50 px-5 text-base shadow-[inset_0_0_0_1px_rgba(1,76,56,0.08)] placeholder:text-secondary-400 focus-visible:bg-white"
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
          href={forgotPasswordHref}
        >
          Lupa password?
        </Link>
      </div>

      <SubmitButton
        className="min-h-[54px] w-full rounded-[14px] text-base font-semibold shadow-[0_16px_30px_-22px_rgba(1,76,56,0.7)]"
        pendingLabel="Memproses..."
        size="lg"
        type="submit"
        variant="brand"
      >
        {isAdminLogin ? "Masuk admin" : "Masuk"}
      </SubmitButton>

      <p className="text-center text-sm leading-6 text-secondary-600">
        {isAdminLogin ? (
          <>
            Akun siswa? Gunakan{" "}
            <Link
              className="font-semibold text-primary-700 hover:text-primary-800"
              href="/login"
            >
              halaman masuk siswa
            </Link>
            .
          </>
        ) : (
          <>
            Butuh akun? Daftar melalui{" "}
            <Link
              className="font-semibold text-primary-700 hover:text-primary-800"
              href={registerUrl}
            >
              formulir pendaftaran
            </Link>
            .
          </>
        )}
      </p>
    </form>
  );
}

export { LoginForm };

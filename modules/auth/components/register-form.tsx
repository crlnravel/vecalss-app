"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";
import { useActionToast } from "@/components/ui/use-action-toast";

import { EMPTY_FORM_STATE } from "../form-state";
import { registerStudentAction } from "../registration-actions";
import { FormNotice } from "./form-notice";
import { SubmitButton } from "./submit-button";
import { TurnstileWidget } from "./turnstile-widget";

function RegisterForm({
  loginHref,
  referral,
  returnTo,
  siteKey,
}: {
  loginHref: string;
  referral?: string | null;
  returnTo?: string | null;
  siteKey: string;
}) {
  const [state, formAction] = useActionState(registerStudentAction, EMPTY_FORM_STATE);
  const keepMessageInline = useActionToast(state);

  return (
    <form action={formAction} className="space-y-5">
      {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
      {referral ? <input name="ref" type="hidden" value={referral} /> : null}

      {state.message && keepMessageInline ? (
        <FormNotice showLabel={false} tone="danger">
          {state.message}
        </FormNotice>
      ) : null}

      <Field>
        <FieldLabel htmlFor="register-name" required>Nama lengkap</FieldLabel>
        <FieldInput
          aria-describedby={state.fieldErrors?.fullName ? "register-name-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.fullName)}
          autoComplete="name"
          defaultValue={state.fields?.fullName ?? ""}
          id="register-name"
          maxLength={160}
          name="fullName"
          placeholder="Nama sesuai yang kamu pakai sehari-hari"
          required
          type="text"
        />
        <FieldError error={state.fieldErrors?.fullName} id="register-name-error" />
      </Field>

      <Field>
        <FieldLabel htmlFor="register-email" required>Email</FieldLabel>
        <FieldInput
          aria-describedby={state.fieldErrors?.email ? "register-email-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          autoComplete="email"
          defaultValue={state.fields?.email ?? ""}
          id="register-email"
          name="email"
          placeholder="nama@email.com"
          required
          type="email"
        />
        <FieldError error={state.fieldErrors?.email} id="register-email-error" />
      </Field>

      <div>
        <label className="flex min-h-11 items-start gap-3 text-sm leading-6 text-secondary-900" htmlFor="register-age">
          <Checkbox
            aria-describedby={state.fieldErrors?.ageConfirmed ? "register-age-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.ageConfirmed)}
            className="mt-1"
            id="register-age"
            name="ageConfirmed"
            required
            value="yes"
          />
          <span>Saya berusia 18 tahun ke atas, atau sudah mendapat izin orang tua/wali</span>
        </label>
        <FieldError error={state.fieldErrors?.ageConfirmed} id="register-age-error" />
      </div>

      {/* A new check is needed after every answer, because the old one was spent. */}
      <TurnstileWidget resetOn={state} siteKey={siteKey} />

      <SubmitButton
        className="w-full"
        pendingLabel="Membuat akun..."
        size="lg"
        type="submit"
        variant="default"
      >
        Buat akun
      </SubmitButton>

      <p className="text-center text-sm leading-6 text-secondary-600">
        Dengan membuat akun, kamu menyetujui{" "}
        <Link className="font-semibold text-primary-700 underline underline-offset-4 hover:text-primary-800" href="/syarat-ketentuan">
          Syarat dan Ketentuan
        </Link>{" "}
        serta{" "}
        <Link className="font-semibold text-primary-700 underline underline-offset-4 hover:text-primary-800" href="/kebijakan-privasi">
          Kebijakan Privasi
        </Link>{" "}
        PTN Pro.
      </p>

      <p className="text-center text-sm leading-6 text-secondary-600">
        Sudah punya akun?{" "}
        <Link className="font-semibold text-primary-700 hover:text-primary-800" href={loginHref}>
          Masuk
        </Link>
        .
      </p>
    </form>
  );
}

export { RegisterForm };

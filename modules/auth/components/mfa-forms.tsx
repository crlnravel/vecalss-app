"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";

import {
  challengeAction,
  confirmEnrollmentAction,
  recoveryCodeAction,
  setupCodeAction,
} from "../mfa-actions";
import { EMPTY_FORM_STATE } from "../form-state";
import { logoutAction } from "../actions";
import { MFA_COPY } from "../mfa-copy";
import { AuthShell } from "./auth-shell";
import { FormNotice } from "./form-notice";
import { SubmitButton } from "./submit-button";

function ReturnToField({ returnTo }: { returnTo?: string | null }) {
  return returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null;
}

function SignOutForm() {
  return (
    <form action={logoutAction} className="mt-6 border-t border-secondary-100 pt-5">
      <Button size="sm" type="submit" variant="quiet">
        {MFA_COPY.signOut}
      </Button>
    </form>
  );
}

/** A single code field plus its submit button, shared by every screen that asks for one code. */
function CodeForm({
  action,
  autoComplete,
  hint,
  inputMode,
  label,
  name,
  pendingLabel,
  placeholder,
  returnTo,
  submitLabel,
}: {
  action: typeof challengeAction;
  autoComplete?: string;
  hint?: string;
  inputMode?: "numeric" | "text";
  label: string;
  name: string;
  pendingLabel: string;
  placeholder: string;
  returnTo?: string | null;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);
  const errorId = `${name}-error`;

  return (
    <form action={formAction} className="space-y-5">
      <ReturnToField returnTo={returnTo} />
      {state.message && state.status === "error" ? (
        <FormNotice showLabel={false} tone="danger">
          {state.message}
        </FormNotice>
      ) : null}

      <Field>
        <FieldLabel htmlFor={`mfa-${name}`} required>{label}</FieldLabel>
        <FieldInput
          aria-describedby={hint ? `mfa-${name}-hint` : undefined}
          autoCapitalize="characters"
          autoComplete={autoComplete ?? "off"}
          autoFocus
          id={`mfa-${name}`}
          inputMode={inputMode}
          name={name}
          placeholder={placeholder}
          required
          spellCheck={false}
          type="text"
        />
        {hint ? <p className="text-sm text-secondary-600" id={`mfa-${name}-hint`}>{hint}</p> : null}
        <FieldError error={state.fieldErrors?.[name]} id={errorId} />
      </Field>

      <SubmitButton className="w-full sm:w-auto" pendingLabel={pendingLabel} size="lg" type="submit" variant="default">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

function ChallengeForms({ mode, returnTo }: { mode: "code" | "recovery"; returnTo?: string | null }) {
  const switchHref = (next: "code" | "recovery") => {
    const query = new URLSearchParams();
    if (next === "recovery") query.set("mode", "recovery");
    if (returnTo) query.set("returnTo", returnTo);
    const text = query.toString();
    return text ? `/mfa?${text}` : "/mfa";
  };

  return (
    <div>
      {mode === "code" ? (
        <CodeForm
          action={challengeAction}
          autoComplete="one-time-code"
          inputMode="numeric"
          label="Kode verifikasi"
          name="code"
          pendingLabel="Memeriksa kode..."
          placeholder="123 456"
          returnTo={returnTo}
          submitLabel="Verifikasi"
        />
      ) : (
        <CodeForm
          action={recoveryCodeAction}
          label="Kode pemulihan"
          name="recoveryCode"
          pendingLabel="Memeriksa kode..."
          placeholder="XXXX-XXXX-XXXX"
          returnTo={returnTo}
          submitLabel="Masuk dengan kode pemulihan"
        />
      )}

      <p className="mt-6 text-sm text-secondary-600">
        {mode === "code" ? "Ponsel tidak bisa dipakai? " : "Ponselmu sudah bisa dipakai? "}
        <Link
          className="font-semibold text-primary-700 hover:text-primary-800"
          href={switchHref(mode === "code" ? "recovery" : "code")}
        >
          {mode === "code" ? "Gunakan kode pemulihan" : "Kembali ke kode verifikasi"}
        </Link>
      </p>
      <SignOutForm />
    </div>
  );
}

function SetupCodeForm({ returnTo }: { returnTo?: string | null }) {
  return (
    <div>
      <CodeForm
        action={setupCodeAction}
        hint={MFA_COPY.setup.hint}
        label="Kode pendaftaran"
        name="setupCode"
        pendingLabel="Memeriksa kode..."
        placeholder="XXXX-XXXX-XXXX"
        returnTo={returnTo}
        submitLabel="Lanjut"
      />
      <SignOutForm />
    </div>
  );
}

/**
 * QR code, manual key and the first code; on success the one-time recovery
 * codes. It owns the page shell because the title and text change once the
 * factor is enabled, and the codes exist only in this component's state.
 */
function EnrollmentScreen({
  manualKey,
  qrSvg,
  returnTo,
}: {
  manualKey: string;
  qrSvg: string;
  returnTo?: string | null;
}) {
  const [state, formAction] = useActionState(confirmEnrollmentAction, EMPTY_FORM_STATE);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  if (state.status === "success" && state.recoveryCodes) {
    const codes = state.recoveryCodes;

    return (
      <AuthShell
        description={MFA_COPY.recoveryCodes.description}
        eyebrow="Verifikasi dua langkah"
        title={MFA_COPY.recoveryCodes.title}
      >
        <div className="space-y-5">
          <ul
            aria-label="Kode pemulihan"
            className="grid grid-cols-1 gap-2 rounded-card border border-secondary-100 bg-secondary-50 p-4 font-mono text-base tracking-wider sm:grid-cols-2"
          >
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>

          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(codes.join("\n"));
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            {copied ? "Sudah disalin" : "Salin semua kode"}
          </Button>

          <label className="flex min-h-11 items-start gap-3 text-base text-secondary-900">
            <input
              checked={saved}
              className="mt-1.5 size-4"
              onChange={(event) => setSaved(event.target.checked)}
              type="checkbox"
            />
            {MFA_COPY.recoveryCodes.acknowledge}
          </label>

          {saved ? (
            <Link className={buttonVariants({ size: "lg" })} href={state.nextPath ?? "/"}>
              Lanjut
            </Link>
          ) : (
            <Button disabled size="lg" type="button">
              Lanjut
            </Button>
          )}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell description={MFA_COPY.scan.description} eyebrow="Verifikasi dua langkah" title={MFA_COPY.scan.title}>
      <form action={formAction} className="space-y-6">
        <ReturnToField returnTo={returnTo} />
        {state.message && state.status === "error" ? (
          <FormNotice showLabel={false} tone="danger">
            {state.message}
          </FormNotice>
        ) : null}

        <div className="flex flex-col items-center gap-3">
          <div
            aria-label="Kode QR untuk aplikasi autentikator"
            className="w-full max-w-[220px] rounded-card border border-secondary-100 bg-white p-2 [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
            role="img"
          />
          <p className="text-center text-sm text-secondary-600">{MFA_COPY.scan.manualKey}</p>
          <p className="break-all text-center font-mono text-base tracking-wider text-secondary-900">{manualKey}</p>
        </div>

        <Field>
          <FieldLabel htmlFor="mfa-enroll-code" required>Kode dari aplikasi</FieldLabel>
          <FieldInput
            autoComplete="one-time-code"
            autoFocus
            id="mfa-enroll-code"
            inputMode="numeric"
            name="code"
            placeholder="123 456"
            required
            type="text"
          />
          <FieldError error={state.fieldErrors?.code} id="mfa-enroll-code-error" />
        </Field>

        <SubmitButton className="w-full sm:w-auto" pendingLabel="Mengaktifkan..." size="lg" type="submit" variant="default">
          Aktifkan
        </SubmitButton>
        <SignOutForm />
      </form>
    </AuthShell>
  );
}

export { ChallengeForms, EnrollmentScreen, SetupCodeForm, SignOutForm };

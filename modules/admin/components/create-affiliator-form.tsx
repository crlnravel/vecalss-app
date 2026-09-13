"use client";

import { useActionState, useState } from "react";

import { ReferenceSelect } from "@/components/dashboard/reference-dashboard-controls";
import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { SubmitButton } from "@/modules/auth/components/submit-button";

import { createAffiliatorEnrollmentAction } from "../actions";
import { ADMIN_CARD_CLASS_NAME } from "../admin-ui-contract";
import { HandoffDeliveryNotice } from "./handoff-delivery-notice";

function CreateAffiliatorForm({ embedded = false }: { embedded?: boolean } = {}) {
  const [state, formAction] = useActionState(createAffiliatorEnrollmentAction, EMPTY_FORM_STATE);
  const [handoffMethod, setHandoffMethod] = useState<"invite_link" | "temporary_password">(
    () => state.fields?.handoffMethod === "invite_link" ? "invite_link" : "temporary_password",
  );

  return (
    <form
      action={formAction}
      className={embedded ? "space-y-5" : `${ADMIN_CARD_CLASS_NAME} space-y-5 overflow-hidden p-6`}
      id="create-affiliator-account"
    >
      <div>
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-secondary-900">Buat akun affiliator</h2>
        <p className="mt-2 max-w-[60ch] text-sm leading-6 text-secondary-600">
          Berikan satu kode referral unik untuk akun yang akan memantau pembelian siswa.
        </p>
      </div>

      {state.message ? <FormNotice tone={state.status === "success" ? "success" : "danger"}>{state.message}</FormNotice> : null}
      {state.temporaryPassword || state.inviteUrl ? <HandoffDeliveryNotice key={state.handoffId} state={state} /> : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="affiliator-full-name">Nama affiliator</FieldLabel>
          <FieldInput
            aria-describedby={state.fieldErrors?.fullName ? "affiliator-full-name-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.fullName)}
            defaultValue={state.fields?.fullName ?? ""}
            id="affiliator-full-name"
            name="fullName"
            placeholder="Salsa Rahma"
            required
          />
          <FieldError error={state.fieldErrors?.fullName} id="affiliator-full-name-error" />
        </Field>

        <Field>
          <FieldLabel htmlFor="affiliator-email">Email affiliator</FieldLabel>
          <FieldInput
            aria-describedby={state.fieldErrors?.email ? "affiliator-email-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.email)}
            defaultValue={state.fields?.email ?? ""}
            id="affiliator-email"
            name="email"
            placeholder="salsa@vecalss.id"
            required
            type="email"
          />
          <FieldError error={state.fieldErrors?.email} id="affiliator-email-error" />
        </Field>

        <Field>
          <FieldLabel htmlFor="affiliator-referral-code">Kode referral</FieldLabel>
          <FieldInput
            aria-describedby={state.fieldErrors?.referralCode ? "affiliator-referral-code-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.referralCode)}
            autoCapitalize="characters"
            defaultValue={state.fields?.referralCode ?? ""}
            id="affiliator-referral-code"
            name="referralCode"
            placeholder="SALSA2027"
            required
          />
          <FieldError error={state.fieldErrors?.referralCode} id="affiliator-referral-code-error" />
        </Field>

        <Field>
          <FieldLabel htmlFor="affiliator-handoff-method">Handoff kredensial</FieldLabel>
          <ReferenceSelect
            aria-label="Handoff kredensial"
            aria-describedby={state.fieldErrors?.handoffMethod ? "affiliator-handoff-method-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.handoffMethod)}
            className={state.fieldErrors?.handoffMethod ? "border-student-status-danger-border ring-3 ring-student-status-danger-border/25" : undefined}
            id="affiliator-handoff-method"
            name="handoffMethod"
            onValueChange={(value) => {
              if (value === "invite_link" || value === "temporary_password") {
                setHandoffMethod(value);
              }
            }}
            options={[
              { label: "Password sementara", value: "temporary_password" },
              { label: "Link undangan (24 jam)", value: "invite_link" },
            ]}
            value={handoffMethod}
          />
          <FieldError error={state.fieldErrors?.handoffMethod} id="affiliator-handoff-method-error" />
        </Field>
      </div>

      <div className="flex justify-start md:justify-end">
        <SubmitButton pendingLabel="Membuat akun..." size="lg" type="submit" variant="brand">
          Buat akun affiliator
        </SubmitButton>
      </div>
    </form>
  );
}

export { CreateAffiliatorForm };

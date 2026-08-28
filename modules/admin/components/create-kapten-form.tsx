"use client";

import { useActionState } from "react";

import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";
import { fieldControlClassName } from "@/components/ui/field-constants";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { SubmitButton } from "@/modules/auth/components/submit-button";
import { ADMIN_CARD_CLASS_NAME } from "../admin-ui-contract";

import { createKaptenEnrollmentAction } from "../actions";
import { HandoffDeliveryNotice } from "./handoff-delivery-notice";

function CreateKaptenForm({ embedded = false }: { embedded?: boolean } = {}) {
  const [state, formAction] = useActionState(createKaptenEnrollmentAction, EMPTY_FORM_STATE);

  return (
    <form
      action={formAction}
      className={embedded ? "space-y-5" : `${ADMIN_CARD_CLASS_NAME} space-y-5 overflow-hidden p-6`}
      id="create-kapten-account"
    >
      <div>
         <h2 className="text-2xl font-semibold tracking-[-0.03em] text-secondary-900">Buat akun Kapten</h2>
        <p className="mt-2 max-w-[60ch] text-sm leading-6 text-secondary-600">
           Tambahkan profil tutor aktif. Kelas dan spesialisasi mata pelajaran diatur secara terpisah.
        </p>
      </div>

      {state.message ? <FormNotice tone={state.status === "success" ? "success" : "danger"}>{state.message}</FormNotice> : null}
      {state.temporaryPassword || state.inviteUrl ? <HandoffDeliveryNotice key={state.handoffId} state={state} /> : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Field>
           <FieldLabel htmlFor="kapten-full-name">Nama Kapten</FieldLabel>
          <FieldInput
            aria-describedby={state.fieldErrors?.fullName ? "kapten-full-name-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.fullName)}
            defaultValue={state.fields?.fullName ?? ""}
            id="kapten-full-name"
            name="fullName"
            placeholder="Dimas Pratama"
            required
          />
          <FieldError error={state.fieldErrors?.fullName} id="kapten-full-name-error" />
        </Field>

        <Field>
           <FieldLabel htmlFor="kapten-email">Email Kapten</FieldLabel>
          <FieldInput
            aria-describedby={state.fieldErrors?.email ? "kapten-email-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.email)}
            defaultValue={state.fields?.email ?? ""}
            id="kapten-email"
            name="email"
            placeholder="dimas@vecalss.id"
            required
            type="email"
          />
          <FieldError error={state.fieldErrors?.email} id="kapten-email-error" />
        </Field>

        <Field>
           <FieldLabel htmlFor="kapten-phone">Nomor telepon</FieldLabel>
          <FieldInput defaultValue={state.fields?.phone ?? ""} id="kapten-phone" name="phone" type="tel" />
        </Field>

        <Field>
          <FieldLabel htmlFor="kapten-headline">Headline</FieldLabel>
          <FieldInput defaultValue={state.fields?.headline ?? ""} id="kapten-headline" name="headline" />
        </Field>

        <Field>
           <FieldLabel htmlFor="kapten-handoff-method">Handoff kredensial</FieldLabel>
          <select
             aria-label="Handoff kredensial"
            aria-describedby={state.fieldErrors?.handoffMethod ? "kapten-handoff-method-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.handoffMethod)}
            className={fieldControlClassName}
            defaultValue={state.fields?.handoffMethod ?? "temporary_password"}
            id="kapten-handoff-method"
            name="handoffMethod"
          >
             <option value="temporary_password">Password sementara</option>
             <option value="invite_link">Link undangan (24 jam)</option>
          </select>
          <FieldError error={state.fieldErrors?.handoffMethod} id="kapten-handoff-method-error" />
        </Field>

        <Field className="md:col-span-2">
          <FieldLabel htmlFor="kapten-bio">Bio</FieldLabel>
          <textarea
            aria-label="Bio"
            className={`${fieldControlClassName} min-h-28 py-3`}
            defaultValue={state.fields?.bio ?? ""}
            id="kapten-bio"
            name="bio"
          />
        </Field>
      </div>

      <div className="flex justify-start md:justify-end">
         <SubmitButton pendingLabel="Membuat akun..." size="lg" type="submit" variant="brand">
           Buat akun Kapten
        </SubmitButton>
      </div>
    </form>
  );
}

export { CreateKaptenForm };

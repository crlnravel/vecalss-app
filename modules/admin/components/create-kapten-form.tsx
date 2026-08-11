"use client";

import { useActionState } from "react";

import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { fieldControlClassName } from "@/components/ui/field-constants";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { SubmitButton } from "@/modules/auth/components/submit-button";
import { ADMIN_CARD_CLASS_NAME } from "../admin-ui-contract";

import { createKaptenEnrollmentAction } from "../actions";
import { HandoffDeliveryNotice } from "./handoff-delivery-notice";

function CreateKaptenForm() {
  const [state, formAction] = useActionState(createKaptenEnrollmentAction, EMPTY_FORM_STATE);

  return (
    <form
      action={formAction}
      className={`${ADMIN_CARD_CLASS_NAME} space-y-5 overflow-hidden p-6`}
      id="create-kapten-account"
    >
      <div>
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-secondary-900">Create a Kapten account</h2>
        <p className="mt-2 max-w-[60ch] text-sm leading-6 text-secondary-600">
          Add an active tutor profile. Cohorts and subject specialties are assigned separately.
        </p>
      </div>

      {state.message ? <FormNotice tone={state.status === "success" ? "success" : "danger"}>{state.message}</FormNotice> : null}
      {state.temporaryPassword || state.inviteUrl ? <HandoffDeliveryNotice state={state} /> : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="kapten-full-name">Kapten name</FieldLabel>
          <FieldInput
            defaultValue={state.fields?.fullName ?? ""}
            id="kapten-full-name"
            name="fullName"
            placeholder="Dimas Pratama"
            required
          />
          {state.fieldErrors?.fullName ? <p className="text-sm text-danger-700">{state.fieldErrors.fullName}</p> : null}
        </Field>

        <Field>
          <FieldLabel htmlFor="kapten-email">Kapten email</FieldLabel>
          <FieldInput
            defaultValue={state.fields?.email ?? ""}
            id="kapten-email"
            name="email"
            placeholder="dimas@vecalss.id"
            required
            type="email"
          />
          {state.fieldErrors?.email ? <p className="text-sm text-danger-700">{state.fieldErrors.email}</p> : null}
        </Field>

        <Field>
          <FieldLabel htmlFor="kapten-phone">Phone</FieldLabel>
          <FieldInput defaultValue={state.fields?.phone ?? ""} id="kapten-phone" name="phone" type="tel" />
        </Field>

        <Field>
          <FieldLabel htmlFor="kapten-headline">Headline</FieldLabel>
          <FieldInput defaultValue={state.fields?.headline ?? ""} id="kapten-headline" name="headline" />
        </Field>

        <Field>
          <FieldLabel htmlFor="kapten-handoff-method">Credential handoff</FieldLabel>
          <select
            aria-label="Credential handoff"
            className={fieldControlClassName}
            defaultValue={state.fields?.handoffMethod ?? "temporary_password"}
            id="kapten-handoff-method"
            name="handoffMethod"
          >
            <option value="temporary_password">Temporary password</option>
            <option value="invite_link">Invite link (24 hours)</option>
          </select>
          {state.fieldErrors?.handoffMethod ? <p className="text-sm text-danger-700">{state.fieldErrors.handoffMethod}</p> : null}
        </Field>

        <Field className="md:col-span-2">
          <FieldLabel htmlFor="kapten-bio">Bio</FieldLabel>
          <textarea
            className={`${fieldControlClassName} min-h-28 py-3`}
            defaultValue={state.fields?.bio ?? ""}
            id="kapten-bio"
            name="bio"
          />
        </Field>
      </div>

      <div className="flex justify-start md:justify-end">
        <SubmitButton pendingLabel="Creating account..." size="lg" type="submit" variant="brand">
          Create Kapten account
        </SubmitButton>
      </div>
    </form>
  );
}

export { CreateKaptenForm };

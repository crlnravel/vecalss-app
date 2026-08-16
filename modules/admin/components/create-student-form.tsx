"use client";

import { useActionState, useCallback, useEffect, useState } from "react";

import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { fieldControlClassName } from "@/components/ui/field-constants";
import type { ExamEvent } from "@/generated/prisma/client";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { SubmitButton } from "@/modules/auth/components/submit-button";
import { ADMIN_CARD_CLASS_NAME } from "../admin-ui-contract";

import { createStudentEnrollmentAction } from "../actions";
import { HandoffDeliveryNotice } from "./handoff-delivery-notice";

function CreateStudentForm({
  embedded = false,
  examEvents,
  onBusyChange,
  onHandoffChange,
}: {
  embedded?: boolean;
  examEvents: Array<Pick<ExamEvent, "id" | "name">>;
  onBusyChange?: (busy: boolean) => void;
  onHandoffChange?: (active: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(createStudentEnrollmentAction, EMPTY_FORM_STATE);
  const [acknowledgedHandoffId, setAcknowledgedHandoffId] = useState<string | null>(null);
  const handoffActive = Boolean(
    state.handoffId &&
      (state.temporaryPassword || state.inviteUrl) &&
      acknowledgedHandoffId !== state.handoffId,
  );

  useEffect(() => {
    onBusyChange?.(pending);
  }, [onBusyChange, pending]);

  useEffect(() => {
    onHandoffChange?.(handoffActive);
  }, [handoffActive, onHandoffChange]);

  const handleHandoffResolved = useCallback(() => {
    if (state.handoffId) {
      setAcknowledgedHandoffId(state.handoffId);
    }
  }, [state.handoffId]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (pending || handoffActive) {
      event.preventDefault();
      return;
    }

    onBusyChange?.(true);
  }

  return (
    <form
      action={formAction}
      className={`${embedded ? "" : `${ADMIN_CARD_CLASS_NAME} overflow-hidden p-6`} space-y-5`}
      id="create-student-account"
      onSubmit={handleSubmit}
    >
      {!embedded ? (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-secondary-900">Create a student account</h2>
            <p className="mt-2 max-w-[56ch] text-sm leading-6 text-secondary-600">
              Add an approved student, set an exam goal, and choose the credential handoff.
            </p>
          </div>
        </div>
      ) : null}

      {state.message ? (
        <FormNotice tone={state.status === "success" ? "success" : "danger"}>
          {state.message}
        </FormNotice>
      ) : null}

      {state.temporaryPassword || state.inviteUrl ? (
        <HandoffDeliveryNotice
          key={state.handoffId}
          onAcknowledged={handleHandoffResolved}
          onRecovery={handleHandoffResolved}
          recoveryHref={state.userId ? `/admin/enrollment/${state.userId}` : undefined}
          state={state}
        />
      ) : null}

      <div aria-disabled={handoffActive || undefined} className={handoffActive ? "pointer-events-none opacity-65" : undefined} inert={handoffActive || undefined}>
        <div className={embedded ? "grid gap-5 sm:grid-cols-2" : "grid gap-5 md:grid-cols-[1.2fr_1fr_0.9fr_0.9fr]"}>
          <Field>
            <FieldLabel htmlFor="student-full-name">Student name</FieldLabel>
            <FieldInput
              defaultValue={state.fields?.fullName ?? ""}
              id="student-full-name"
              name="fullName"
              placeholder="Alya Ramadhani"
              required
            />
            {state.fieldErrors?.fullName ? (
              <p className="text-sm text-danger-700">{state.fieldErrors.fullName}</p>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="student-email">Student email</FieldLabel>
            <FieldInput
              defaultValue={state.fields?.email ?? ""}
              id="student-email"
              name="email"
              placeholder="alya@student.vecalss.id"
              required
              type="email"
            />
            {state.fieldErrors?.email ? (
              <p className="text-sm text-danger-700">{state.fieldErrors.email}</p>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="student-exam-goal">Target exam</FieldLabel>
            <select
              aria-label="Target exam"
              className={fieldControlClassName}
              defaultValue={state.fields?.targetExamEventId ?? ""}
              id="student-exam-goal"
              name="targetExamEventId"
            >
              <option value="">Set later</option>
              {examEvents.map((examEvent) => (
                <option key={examEvent.id} value={examEvent.id}>
                  {examEvent.name}
                </option>
              ))}
            </select>
          </Field>

          <Field>
            <FieldLabel htmlFor="student-handoff-method">Credential handoff</FieldLabel>
            <select
              aria-label="Credential handoff"
              className={fieldControlClassName}
              defaultValue={state.fields?.handoffMethod ?? "temporary_password"}
              id="student-handoff-method"
              name="handoffMethod"
            >
              <option value="temporary_password">Temporary password</option>
              <option value="invite_link">Invite link (24 hours)</option>
            </select>
            {state.fieldErrors?.handoffMethod ? (
              <p className="text-sm text-danger-700">{state.fieldErrors.handoffMethod}</p>
            ) : null}
          </Field>
        </div>

        <div className="mt-5 flex justify-start md:justify-end">
          <SubmitButton disabled={handoffActive} pendingLabel="Creating account..." size="lg" type="submit" variant="brand">
            Create student account
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

export { CreateStudentForm };

"use client";

import { useActionState } from "react";

import { Field, FieldInput, FieldLabel, fieldControlClassName } from "@/components/ui/field";
import type { ExamEvent } from "@/generated/prisma/client";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { SubmitButton } from "@/modules/auth/components/submit-button";

import { createStudentEnrollmentAction } from "../actions";

function CreateStudentForm({ examEvents }: { examEvents: ExamEvent[] }) {
  const [state, formAction] = useActionState(createStudentEnrollmentAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="space-y-5 rounded-[28px] border border-primary-100 bg-white p-6 shadow-[0_18px_60px_-40px_rgba(17,37,26,0.45)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.16em] text-primary-700 uppercase">
            UC-18 Enrollment
          </p>
          <h2 className="mt-2 text-2xl font-medium">Create a student account</h2>
          <p className="mt-2 max-w-[56ch] text-sm leading-6 text-secondary-600">
            Provision approved students, assign their first exam goal if it is already
            known, and hand off a one-time temporary password securely.
          </p>
        </div>
      </div>

      {state.message ? (
        <FormNotice tone={state.status === "success" ? "success" : "danger"}>
          {state.message}
        </FormNotice>
      ) : null}

      {state.temporaryPassword ? (
        <FormNotice tone="neutral">
          <p className="font-medium">Temporary password</p>
          <p className="mt-1 font-mono text-sm">{state.temporaryPassword}</p>
        </FormNotice>
      ) : null}

      <div className="grid gap-5 md:grid-cols-[1.2fr_1fr_0.9fr]">
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
      </div>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Creating account..." size="lg" type="submit" variant="brand">
          Create student account
        </SubmitButton>
      </div>
    </form>
  );
}

export { CreateStudentForm };

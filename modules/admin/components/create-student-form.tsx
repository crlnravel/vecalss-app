"use client";

import { useActionState, useCallback, useState } from "react";

import { ReferenceSelectField } from "@/components/dashboard";
import { Field, FieldError, FieldInput, FieldLabel } from "@/components/ui/field";
import type { ExamEvent } from "@/generated/prisma/client";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";
import type { FormState } from "@/modules/auth/form-state";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { SubmitButton } from "@/modules/auth/components/submit-button";
import { ADMIN_CARD_CLASS_NAME } from "../admin-ui-contract";

import { createStudentEnrollmentAction } from "../actions";
import { HandoffDeliveryNotice } from "./handoff-delivery-notice";

type StudentDropdownOption = {
  label: string;
  value: string;
};

type CreateStudentFormController = {
  formAction: (payload: FormData) => void;
  onHandoffResolved?: (handoffId: string) => void;
  pending: boolean;
  state: FormState;
};

function StudentDropdownField({
  error,
  help,
  id,
  label,
  name,
  onValueChange,
  options,
  value,
}: {
  error?: string;
  help?: string;
  id: string;
  label: string;
  name: string;
  onValueChange: (value: string) => void;
  options: StudentDropdownOption[];
  value: string;
}) {
  return (
    <ReferenceSelectField
      aria-label={label}
      className={error ? "border-student-status-danger-border ring-3 ring-student-status-danger-border/25" : undefined}
      error={error}
      help={help}
      id={id}
      label={label}
      name={name}
      onValueChange={onValueChange}
      options={options}
      placeholder="Atur nanti"
      value={value}
    />
  );
}

function CreateStudentFormFields({
  embedded,
  email,
  examEvents,
  fullName,
  handoffActive,
  handoffMethod,
  onHandoffMethodChange,
  pending,
  setEmail,
  setFullName,
  setTargetExamEventId,
  state,
  targetExamEventId,
}: {
  embedded: boolean;
  email: string;
  examEvents: Array<Pick<ExamEvent, "id" | "name">>;
  fullName: string;
  handoffActive: boolean;
  handoffMethod: "invite_link" | "temporary_password";
  onHandoffMethodChange: (value: string) => void;
  pending: boolean;
  setEmail: (value: string) => void;
  setFullName: (value: string) => void;
  setTargetExamEventId: (value: string) => void;
  state: FormState;
  targetExamEventId: string;
}) {
  const isFormComplete = fullName.trim().length > 0 && email.trim().length > 0;

  return (
    <div aria-disabled={handoffActive || undefined} className={handoffActive ? "pointer-events-none opacity-65" : undefined} inert={handoffActive || undefined}>
      <div className={embedded ? "grid gap-5 sm:grid-cols-2" : "grid gap-5 md:grid-cols-[1.2fr_1fr_0.9fr_0.9fr]"}>
        <Field>
          <FieldLabel htmlFor="student-full-name" required>Nama siswa</FieldLabel>
          <FieldInput aria-describedby={state.fieldErrors?.fullName ? "student-full-name-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.fullName)} id="student-full-name" name="fullName" onChange={(event) => setFullName(event.currentTarget.value)} placeholder="Alya Ramadhani" required value={fullName} />
          <FieldError error={state.fieldErrors?.fullName} id="student-full-name-error" />
        </Field>
        <Field>
          <FieldLabel htmlFor="student-email" required>Email siswa</FieldLabel>
          <FieldInput aria-describedby={state.fieldErrors?.email ? "student-email-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.email)} id="student-email" name="email" onChange={(event) => setEmail(event.currentTarget.value)} placeholder="alya@student.vecalss.id" required type="email" value={email} />
          <FieldError error={state.fieldErrors?.email} id="student-email-error" />
        </Field>
        <StudentDropdownField
          id="student-exam-goal"
          label="Target ujian"
          name="targetExamEventId"
          onValueChange={setTargetExamEventId}
          options={[{ label: "Atur nanti", value: "" }, ...examEvents.map((examEvent) => ({ label: examEvent.name, value: examEvent.id }))]}
          value={targetExamEventId}
        />
        <StudentDropdownField
          error={state.fieldErrors?.handoffMethod}
          help="Pilih cara siswa menerima kredensial login pertamanya."
          id="student-handoff-method"
          label="Handoff kredensial"
          name="handoffMethod"
          onValueChange={onHandoffMethodChange}
          options={[{ label: "Password sementara", value: "temporary_password" }, { label: "Link undangan (24 jam)", value: "invite_link" }]}
          value={handoffMethod}
        />
      </div>
      <div className="mt-5 flex justify-start md:justify-end">
        <SubmitButton className={embedded ? "mt-1 w-full" : undefined} disabled={pending || handoffActive || !isFormComplete} pendingLabel="Membuat akun..." size="lg" type="submit" variant="brand">Buat akun siswa</SubmitButton>
      </div>
    </div>
  );
}

function CreateStudentForm({
  controller,
  embedded = false,
  examEvents,
}: {
  controller?: CreateStudentFormController;
  embedded?: boolean;
  examEvents: Array<Pick<ExamEvent, "id" | "name">>;
}) {
  const [localState, localFormAction, localPending] = useActionState(createStudentEnrollmentAction, EMPTY_FORM_STATE);
  const state = controller?.state ?? localState;
  const formAction = controller?.formAction ?? localFormAction;
  const pending = controller?.pending ?? localPending;
  const [targetExamEventId, setTargetExamEventId] = useState("");
  const [handoffMethod, setHandoffMethod] = useState<"invite_link" | "temporary_password">("temporary_password");
  const [fullName, setFullName] = useState(() => state.fields?.fullName ?? "");
  const [email, setEmail] = useState(() => state.fields?.email ?? "");
  const [acknowledgedHandoffId, setAcknowledgedHandoffId] = useState<string | null>(null);
  const onHandoffResolved = controller?.onHandoffResolved;
  const handoffActive = Boolean(
    state.handoffId &&
      (state.temporaryPassword || state.inviteUrl) &&
      acknowledgedHandoffId !== state.handoffId,
  );

  const handleHandoffResolved = useCallback(() => {
    if (state.handoffId) {
      setAcknowledgedHandoffId(state.handoffId);
      onHandoffResolved?.(state.handoffId);
    }
  }, [onHandoffResolved, state.handoffId]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (pending || handoffActive) {
      event.preventDefault();
      return;
    }

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
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-secondary-900">Buat akun siswa</h2>
            <p className="mt-2 max-w-[56ch] text-sm leading-6 text-secondary-600">
              Tambahkan siswa yang sudah disetujui, atur target ujian, dan pilih metode handoff kredensial.
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

      <CreateStudentFormFields
        embedded={embedded}
        email={email}
        examEvents={examEvents}
        fullName={fullName}
        handoffActive={handoffActive}
        handoffMethod={handoffMethod}
        onHandoffMethodChange={(value) => {
          if (value === "invite_link" || value === "temporary_password") setHandoffMethod(value);
        }}
        pending={pending}
        setEmail={setEmail}
        setFullName={setFullName}
        setTargetExamEventId={setTargetExamEventId}
        state={state}
        targetExamEventId={targetExamEventId}
      />
    </form>
  );
}

export { CreateStudentForm };
export type { CreateStudentFormController };

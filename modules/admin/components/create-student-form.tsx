"use client";

import { useActionState, useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ExamEvent } from "@/generated/prisma/client";
import { ChevronDown, CircleHelp } from "@/lib/icons";
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
  const selectedLabel = options.find((option) => option.value === value)?.label ?? "Set later";

  return (
    <Field>
      <div className="flex items-center gap-1.5">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {help ? (
          <Tooltip>
            <TooltipTrigger render={<Button aria-label={`${label} guidance`} size="icon-xs" type="button" variant="ghost" />}>
              <CircleHelp aria-hidden="true" size={15} />
            </TooltipTrigger>
            <TooltipContent>{help}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={label}
          id={id}
          render={<Button className="min-w-0 w-full justify-between rounded-2xl border-secondary-900/14 bg-white px-5 py-3.5 text-left text-[15px] font-normal text-secondary-900 hover:border-primary-300 hover:bg-primary-50/40" variant="context" />}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-secondary-500" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-(--anchor-width)">
          <DropdownMenuRadioGroup onValueChange={(nextValue) => onValueChange(String(nextValue))} value={value}>
            {options.map((option) => (
              <DropdownMenuRadioItem closeOnClick key={option.value || "empty"} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <input name={name} type="hidden" value={value} />
      {error ? <p className="text-sm text-danger-700">{error}</p> : null}
    </Field>
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
  const isFormComplete = fullName.trim().length > 0 && email.trim().length > 0;

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
              id="student-full-name"
              name="fullName"
              onChange={(event) => setFullName(event.currentTarget.value)}
              placeholder="Alya Ramadhani"
              required
              value={fullName}
            />
            {state.fieldErrors?.fullName ? (
              <p className="text-sm text-danger-700">{state.fieldErrors.fullName}</p>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="student-email">Student email</FieldLabel>
            <FieldInput
              id="student-email"
              name="email"
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder="alya@student.vecalss.id"
              required
              type="email"
              value={email}
            />
            {state.fieldErrors?.email ? (
              <p className="text-sm text-danger-700">{state.fieldErrors.email}</p>
            ) : null}
          </Field>

          <StudentDropdownField
            id="student-exam-goal"
            label="Target exam"
            name="targetExamEventId"
            onValueChange={setTargetExamEventId}
            options={[
              { label: "Set later", value: "" },
              ...examEvents.map((examEvent) => ({ label: examEvent.name, value: examEvent.id })),
            ]}
            value={targetExamEventId}
          />

          <StudentDropdownField
            error={state.fieldErrors?.handoffMethod}
            help="Choose how the student receives their first login credentials."
            id="student-handoff-method"
            label="Credential handoff"
            name="handoffMethod"
            onValueChange={(value) => {
              if (value === "invite_link" || value === "temporary_password") {
                setHandoffMethod(value);
              }
            }}
            options={[
              { label: "Temporary password", value: "temporary_password" },
              { label: "Invite link (24 hours)", value: "invite_link" },
            ]}
            value={handoffMethod}
          />
        </div>

        <div className="mt-5 flex justify-start md:justify-end">
          <SubmitButton className={embedded ? "mt-1 w-full" : undefined} disabled={pending || handoffActive || !isFormComplete} pendingLabel="Creating account..." size="lg" type="submit" variant="brand">
            Create student account
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

export { CreateStudentForm };
export type { CreateStudentFormController };

"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { fieldControlClassName, Field, FieldLabel } from "@/components/ui/field";
import type { ExamEvent, Major, University } from "@/generated/prisma/client";
import { saveOnboardingAction, skipOnboardingAction } from "@/modules/student/actions";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { SubmitButton } from "@/modules/auth/components/submit-button";

function OnboardingForm({
  examEvents,
  majors,
  universities,
}: {
  examEvents: ExamEvent[];
  majors: Array<Major & { university: University }>;
  universities: University[];
}) {
  const [state, formAction] = useActionState(saveOnboardingAction, EMPTY_FORM_STATE);

  const hasGoalChoices = examEvents.length > 0 || universities.length > 0 || majors.length > 0;

  return (
    <div className="space-y-6">
      {!hasGoalChoices ? (
        <FormNotice tone="neutral">
          Goal options have not been seeded yet, so you can safely skip this step and
          update your targets later.
        </FormNotice>
      ) : null}

      {state.message ? <FormNotice tone="danger">{state.message}</FormNotice> : null}

      <form action={formAction} className="space-y-5 rounded-[28px] border border-primary-100 bg-white p-6 shadow-[0_18px_60px_-40px_rgba(17,37,26,0.45)]">
        <div className="grid gap-5 md:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="target-exam">Target exam</FieldLabel>
            <select
              className={fieldControlClassName}
              defaultValue={state.fields?.targetExamEventId ?? ""}
              id="target-exam"
              name="targetExamEventId"
            >
              <option value="">Choose later</option>
              {examEvents.map((examEvent) => (
                <option key={examEvent.id} value={examEvent.id}>
                  {examEvent.name}
                </option>
              ))}
            </select>
          </Field>

          <Field>
            <FieldLabel htmlFor="target-university">Target university</FieldLabel>
            <select
              className={fieldControlClassName}
              defaultValue={state.fields?.targetUniversityId ?? ""}
              id="target-university"
              name="targetUniversityId"
            >
              <option value="">Choose later</option>
              {universities.map((university) => (
                <option key={university.id} value={university.id}>
                  {university.name}
                </option>
              ))}
            </select>
          </Field>

          <Field>
            <FieldLabel htmlFor="target-major">Target major</FieldLabel>
            <select
              className={fieldControlClassName}
              defaultValue={state.fields?.targetMajorId ?? ""}
              id="target-major"
              name="targetMajorId"
            >
              <option value="">Choose later</option>
              {majors.map((major) => (
                <option key={major.id} value={major.id}>
                  {major.name} · {major.university.shortName ?? major.university.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
          <Button formAction={skipOnboardingAction} type="submit" variant="brandOutline">
            Skip for now
          </Button>
          <SubmitButton pendingLabel="Saving goals..." size="lg" type="submit" variant="brand">
            Complete onboarding
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}

export { OnboardingForm };

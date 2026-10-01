"use client";

import { useActionState, useState } from "react";

import { ReferenceSelect } from "@/components/dashboard/reference-dashboard-controls";
import { REFERENCE_CONTROL_CLASS_NAMES, REFERENCE_SURFACE_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { CircleHelp } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useActionToast } from "@/components/ui/use-action-toast";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";
import { SubmitButton } from "@/modules/auth/components/submit-button";
import { cn } from "@/lib/utils";

import { sendKelasNotificationAction } from "../actions";

type KelasOption = {
  activeStudentCount: number;
  id: string;
  name: string;
};

function KelasNotificationForm({ cohorts }: { cohorts: KelasOption[] }) {
  const [state, formAction] = useActionState(sendKelasNotificationAction, EMPTY_FORM_STATE);
  const keepMessageInline = useActionToast(state);
  const [cohortId, setCohortId] = useState(() => state.fields?.cohortId ?? "");
  const formKey = state.status === "success" ? state.message ?? "success" : "form";

  return (
    <form
      action={formAction}
      className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "min-w-0 space-y-6 p-5 sm:p-7")}
      id="send-kelas-notification"
      key={formKey}
    >
      {state.message && keepMessageInline ? <FormNotice tone="danger">{state.message}</FormNotice> : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="kelas-notification-cohort" required>Kelas</FieldLabel>
          <ReferenceSelect
            aria-label="Kelas penerima"
            aria-describedby={state.fieldErrors?.cohortId ? "kelas-notification-cohort-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.cohortId)}
            className={state.fieldErrors?.cohortId ? "border-student-status-danger-border ring-3 ring-student-status-danger-border/25" : undefined}
            id="kelas-notification-cohort"
            name="cohortId"
            onValueChange={setCohortId}
            options={cohorts.map((cohort) => ({
              disabled: cohort.activeStudentCount === 0,
              label: `${cohort.name} · ${cohort.activeStudentCount} siswa aktif`,
              value: cohort.id,
            }))}
            placeholder="Pilih kelas"
            required
            value={cohortId}
          />
          <FieldError error={state.fieldErrors?.cohortId} id="kelas-notification-cohort-error" />
        </Field>

        <Field>
          <FieldLabel htmlFor="kelas-notification-title" required>Judul</FieldLabel>
          <FieldInput
            aria-describedby={state.fieldErrors?.title ? "kelas-notification-title-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.title)}
            className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "aria-invalid:border-student-status-danger-border aria-invalid:ring-3 aria-invalid:ring-student-status-danger-border/25")}
            defaultValue={state.fields?.title ?? "Link kelas Zoom"}
            id="kelas-notification-title"
            maxLength={180}
            name="title"
            placeholder="Kelas live hari ini"
            required
          />
          <FieldError error={state.fieldErrors?.title} id="kelas-notification-title-error" />
        </Field>

        <Field className="md:col-span-2">
          <div className="flex items-center gap-1.5">
            <FieldLabel htmlFor="kelas-notification-body" required>Pesan</FieldLabel>
            <Tooltip>
              <TooltipTrigger render={<Button aria-label="Bantuan format pesan" className="text-secondary-500 hover:text-primary-800" size="icon-sm" type="button" variant="outline" />}>
                <CircleHelp aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>Markdown disuport</TooltipContent>
            </Tooltip>
          </div>
          <FieldTextarea
            aria-describedby={state.fieldErrors?.body ? "kelas-notification-body-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.body)}
            className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "min-h-32 py-3 aria-invalid:border-student-status-danger-border aria-invalid:ring-3 aria-invalid:ring-student-status-danger-border/25")}
            defaultValue={state.fields?.body ?? ""}
            id="kelas-notification-body"
            maxLength={4000}
            name="body"
            placeholder="Kelas dimulai pukul 19.00 WIB. Siapkan catatan dan masuk melalui tautan Zoom berikut."
            required
          />
          <FieldError error={state.fieldErrors?.body} id="kelas-notification-body-error" />
        </Field>

      </div>

      <div className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-end">
        <SubmitButton pendingLabel="Mengirim…" size="lg" type="submit" variant="default">
          Kirim
        </SubmitButton>
      </div>
    </form>
  );
}

export { KelasNotificationForm };
export type { KelasOption };

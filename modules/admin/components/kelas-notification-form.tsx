"use client";

import { useActionState } from "react";

import { CircleHelp } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";
import { SubmitButton } from "@/modules/auth/components/submit-button";

import { sendKelasNotificationAction } from "../actions";
import { ADMIN_CARD_CLASS_NAME } from "../admin-ui-contract";

type KelasOption = {
  activeStudentCount: number;
  id: string;
  name: string;
};

function KelasNotificationForm({ cohorts }: { cohorts: KelasOption[] }) {
  const [state, formAction] = useActionState(sendKelasNotificationAction, EMPTY_FORM_STATE);
  const formKey = state.status === "success" ? state.message ?? "success" : "form";

  return (
    <form
      action={formAction}
      className={`${ADMIN_CARD_CLASS_NAME} space-y-6 p-5 sm:p-7`}
      id="send-kelas-notification"
      key={formKey}
    >
      {state.message ? <FormNotice tone={state.status === "success" ? "success" : "danger"}>{state.message}</FormNotice> : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="kelas-notification-cohort">Kelas</FieldLabel>
          <select
            aria-label="Kelas penerima"
            aria-describedby={state.fieldErrors?.cohortId ? "kelas-notification-cohort-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.cohortId)}
            className="h-12 rounded-2xl border border-secondary-900/14 bg-white px-4 text-base text-secondary-900 outline-none transition focus:border-primary-400 focus:ring-3 focus:ring-primary-700/12 aria-invalid:border-student-status-danger-border aria-invalid:ring-3 aria-invalid:ring-student-status-danger-border/25"
            defaultValue={state.fields?.cohortId ?? ""}
            id="kelas-notification-cohort"
            name="cohortId"
            required
          >
            <option value="">Pilih kelas</option>
            {cohorts.map((cohort) => (
              <option disabled={cohort.activeStudentCount === 0} key={cohort.id} value={cohort.id}>
                {cohort.name} · {cohort.activeStudentCount} siswa aktif
              </option>
            ))}
          </select>
          <FieldError error={state.fieldErrors?.cohortId} id="kelas-notification-cohort-error" />
        </Field>

        <Field>
          <FieldLabel htmlFor="kelas-notification-title">Judul</FieldLabel>
          <FieldInput
            aria-describedby={state.fieldErrors?.title ? "kelas-notification-title-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.title)}
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
            <FieldLabel htmlFor="kelas-notification-body">Pesan</FieldLabel>
            <Tooltip>
              <TooltipTrigger render={<Button aria-label="Bantuan format pesan" className="text-secondary-500 hover:text-primary-800" size="icon-xs" type="button" variant="ghost" />}>
                <CircleHelp aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>Markdown disuport</TooltipContent>
            </Tooltip>
          </div>
          <FieldTextarea
            aria-describedby={state.fieldErrors?.body ? "kelas-notification-body-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.body)}
            className="min-h-32 py-3"
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
        <SubmitButton pendingLabel="Mengirim…" size="lg" type="submit" variant="brand">
          Kirim
        </SubmitButton>
      </div>
    </form>
  );
}

export { KelasNotificationForm };
export type { KelasOption };

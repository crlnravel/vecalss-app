"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import type { AccessStatus } from "@/lib/billing/service";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { SubmitButton } from "@/modules/auth/components/submit-button";

import { manageStudentAccessAction } from "../billing-actions";
import {
  ACCESS_OPERATION_HINT,
  ACCESS_OPERATION_LABEL,
  ACCESS_STATUS_LABEL,
  type AccessOperation,
} from "../billing-copy";

type AccessHistoryRow = {
  actorName: string | null;
  endsAtLabel: string | null;
  id: string;
  label: string;
  occurredAtLabel: string;
  planLabel: string | null;
  reason: string;
};

type StudentAccessPanelProps = {
  endsAtLabel: string | null;
  enforced: boolean;
  fullPlansReady: { full_mandiri: boolean; full_utbk: boolean };
  history: AccessHistoryRow[];
  idempotencyKey: string;
  planLabel: string | null;
  status: AccessStatus;
  studentId: string;
};

const OPERATIONS_BY_STATUS: Record<AccessStatus, AccessOperation[]> = {
  active: ["extend", "pause", "revoke"],
  expired: ["grant", "extend"],
  none: ["grant"],
  paused: ["resume", "revoke"],
  revoked: ["grant"],
};

const STATUS_TONE: Record<AccessStatus, "attention" | "danger" | "neutral" | "success"> = {
  active: "success",
  expired: "attention",
  none: "neutral",
  paused: "attention",
  revoked: "danger",
};

const fieldClassName = REFERENCE_CONTROL_CLASS_NAMES.input;

function StudentAccessPanel({
  endsAtLabel,
  enforced,
  fullPlansReady,
  history,
  idempotencyKey,
  planLabel,
  status,
  studentId,
}: StudentAccessPanelProps) {
  const [state, formAction] = useActionState(manageStudentAccessAction, EMPTY_FORM_STATE);
  const operations = OPERATIONS_BY_STATUS[status];
  const [chosen, setChosen] = useState<AccessOperation>(operations[0]);
  const operation = operations.includes(chosen) ? chosen : operations[0];
  const needsPlan = operation === "grant" || operation === "extend";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge size="md" tone={STATUS_TONE[status]}>{ACCESS_STATUS_LABEL[status]}</Badge>
        {planLabel ? <span className="text-sm font-medium text-secondary-900">{planLabel}</span> : null}
        {endsAtLabel ? <span className="text-sm text-secondary-600">Berlaku sampai {endsAtLabel}</span> : null}
      </div>

      {!enforced ? (
        <p className="rounded-card border border-primary-100 bg-primary-50/60 px-4 py-3 text-sm leading-6 text-secondary-700">
          Pembatasan paket belum diaktifkan, jadi semua siswa masih bisa belajar tanpa paket. Perubahan di sini tetap tercatat.
        </p>
      ) : null}

      <form action={formAction} className="space-y-5">
        <input name="studentId" type="hidden" value={studentId} />
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />

        {state.message ? (
          <FormNotice showLabel={false} tone={state.status === "success" ? "success" : "danger"}>
            {state.message}
          </FormNotice>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-secondary-900">Pilih tindakan</legend>
          {operations.map((item) => (
            <label
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-card border border-primary-100 bg-white px-4 py-3 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50/60"
              key={item}
            >
              <input
                checked={operation === item}
                className="mt-1 size-4"
                name="operation"
                onChange={() => setChosen(item)}
                type="radio"
                value={item}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-secondary-900">{ACCESS_OPERATION_LABEL[item]}</span>
                <span className="block text-sm leading-6 text-secondary-600">{ACCESS_OPERATION_HINT[item]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {needsPlan ? (
          <Field className="gap-2">
            <FieldLabel htmlFor="access-plan" required>Paket</FieldLabel>
            <select className={fieldClassName} defaultValue="monthly" id="access-plan" name="plan" required>
              <option value="monthly">Akses Bulanan (1 bulan)</option>
              <option disabled={!fullPlansReady.full_utbk} value="full_utbk">
                Full Access (UTBK-SNBT){fullPlansReady.full_utbk ? "" : " · tanggal akhir belum diatur"}
              </option>
              <option disabled={!fullPlansReady.full_mandiri} value="full_mandiri">
                Full Access (Ujian Mandiri){fullPlansReady.full_mandiri ? "" : " · tanggal akhir belum diatur"}
              </option>
            </select>
          </Field>
        ) : null}

        <Field className="gap-2">
          <FieldLabel htmlFor="access-reason" required>Alasan</FieldLabel>
          <Textarea
            className="min-h-24 border-primary-100 bg-white"
            id="access-reason"
            maxLength={500}
            name="reason"
            placeholder="Contoh: pembayaran paket bulanan sudah dikonfirmasi"
            required
          />
          <p className="text-xs leading-5 text-secondary-500">Alasan ini tersimpan di riwayat dan tidak bisa diubah.</p>
        </Field>

        <SubmitButton
          pendingLabel="Menyimpan..."
          size="lg"
          type="submit"
          variant={operation === "revoke" ? "destructive" : "default"}
        >
          {ACCESS_OPERATION_LABEL[operation]}
        </SubmitButton>
      </form>

      <div>
        <h3 className="text-sm font-semibold text-secondary-900">Riwayat akses</h3>
        {history.length ? (
          <ol className="mt-3 divide-y divide-primary-100 rounded-card border border-primary-100">
            {history.map((item) => (
              <li className="space-y-1 px-4 py-3 text-sm" key={item.id}>
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold text-secondary-900">
                    {item.label}{item.planLabel ? ` · ${item.planLabel}` : ""}
                  </span>
                  <span className="text-xs text-secondary-500">{item.occurredAtLabel}</span>
                </p>
                <p className="text-secondary-700">{item.reason}</p>
                <p className="text-xs text-secondary-500">
                  {item.actorName ? `Oleh ${item.actorName}` : "Oleh sistem"}
                  {item.endsAtLabel ? ` · berlaku sampai ${item.endsAtLabel}` : ""}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-secondary-600">Belum ada perubahan akses yang tercatat.</p>
        )}
      </div>
    </div>
  );
}

export { StudentAccessPanel };
export type { AccessHistoryRow, StudentAccessPanelProps };

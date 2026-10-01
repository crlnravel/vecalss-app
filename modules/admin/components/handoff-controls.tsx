"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldRequiredMark } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { useActionToast } from "@/components/ui/use-action-toast";
import type { EnrollmentHandoffMethod, EnrollmentHandoffStatus } from "@/generated/prisma/client";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";

import { reissueEnrollmentHandoffAction } from "../actions";
import { HandoffDeliveryNotice } from "./handoff-delivery-notice";

function formatMethod(method: EnrollmentHandoffMethod) {
  return method === "invite_link" ? "Tautan undangan" : "Kata sandi sementara";
}

function formatStatus(status: EnrollmentHandoffStatus) {
  return {
    pending: "Menunggu",
    expired: "Kedaluwarsa",
    revoked: "Dicabut",
    released: "Dirilis",
    completed: "Selesai",
  }[status] ?? "Status akses belum tersedia";
}

function statusTone(status: EnrollmentHandoffStatus) {
  if (status === "pending") {
    return "attention" as const;
  }

  if (status === "expired" || status === "revoked") {
    return "danger" as const;
  }

  if (status === "released" || status === "completed") {
    return "success" as const;
  }

  return "neutral" as const;
}

function formatDateTime(value: Date) {
    return value.toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function HandoffControls({
  expiresAt,
  handoffId,
  method,
  sourceImportRowId,
  status,
}: {
  expiresAt: Date | null;
  handoffId: string;
  method: EnrollmentHandoffMethod;
  sourceImportRowId: string | null;
  status: EnrollmentHandoffStatus;
}) {
  const [state, formAction, pending] = useActionState(reissueEnrollmentHandoffAction, EMPTY_FORM_STATE);
  const keepMessageInline = useActionToast(state);

  return (
    <div className="space-y-4 text-sm text-secondary-700">
      <div className="flex flex-wrap items-center gap-2">
        <Badge size="sm" tone={statusTone(status)}>{formatStatus(status)}</Badge>
        <span className="text-secondary-600">{formatMethod(method)}</span>
      </div>
      {expiresAt ? (
        <dl className="border-y border-primary-100 py-3 text-xs">
          <div className="flex items-center justify-between gap-4">
             <dt className="text-secondary-600">Kedaluwarsa</dt>
            <dd className="text-right font-medium text-secondary-800">
              <time dateTime={expiresAt.toISOString()}>{formatDateTime(expiresAt)}</time>
            </dd>
          </div>
        </dl>
      ) : null}
      {state.message && keepMessageInline ? <FormNotice tone="danger">{state.message}</FormNotice> : null}
      {state.handoffId && (state.inviteUrl || state.temporaryPassword) ? <HandoffDeliveryNotice key={state.handoffId} state={state} /> : null}
      {sourceImportRowId ? (
        <p className="rounded-card border border-secondary-200 bg-secondary-50 px-3 py-3 text-xs leading-5 text-secondary-600">
           Informasi akses dari impor belum bisa dibuat ulang di sini. Nilai akses yang dibuat saat impor hanya ditampilkan sekali.
        </p>
      ) : state.status !== "success" || !state.handoffId ? (
        <form action={formAction} className="space-y-3">
          <input name="handoffId" type="hidden" value={handoffId} />
          <label className="flex items-start gap-3 text-xs leading-5 text-secondary-600">
            <input className="mt-1 size-4 shrink-0 accent-primary-700" name="confirmation" required type="checkbox" value="reissue" />
            <span>Saya memahami bahwa tindakan ini akan membatalkan akses saat ini dan membuat akses baru.<FieldRequiredMark /></span>
          </label>
           <Button className="min-h-11" disabled={pending} size="sm" type="submit" variant="outline">{pending ? "Menyiapkan akses baru…" : "Buat ulang akses"}</Button>
        </form>
      ) : null}
    </div>
  );
}

export { HandoffControls };

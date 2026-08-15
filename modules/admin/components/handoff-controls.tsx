"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { StudentBadge } from "@/components/ui/student-badge";
import type { EnrollmentHandoffMethod, EnrollmentHandoffStatus } from "@/generated/prisma/client";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";

import { reissueEnrollmentHandoffAction } from "../actions";
import { HandoffDeliveryNotice } from "./handoff-delivery-notice";

function formatMethod(method: EnrollmentHandoffMethod) {
  return method === "invite_link" ? "Invite link" : "Temporary password";
}

function formatStatus(status: EnrollmentHandoffStatus) {
  return status.replaceAll("_", " ");
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
  return value.toLocaleString("en-US", {
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

  return (
    <div className="space-y-4 text-sm text-secondary-700">
      <div className="flex flex-wrap items-center gap-2">
        <StudentBadge size="sm" tone={statusTone(status)}>{formatStatus(status)}</StudentBadge>
        <span className="text-secondary-600">{formatMethod(method)}</span>
      </div>
      {expiresAt ? (
        <dl className="border-y border-primary-100 py-3 text-xs">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-secondary-600">Expires</dt>
            <dd className="text-right font-medium text-secondary-800">
              <time dateTime={expiresAt.toISOString()}>{formatDateTime(expiresAt)}</time>
            </dd>
          </div>
        </dl>
      ) : null}
      {state.message ? <FormNotice tone={state.status === "success" ? "success" : "danger"}>{state.message}</FormNotice> : null}
      {state.handoffId && (state.inviteUrl || state.temporaryPassword) ? <HandoffDeliveryNotice state={state} /> : null}
      {sourceImportRowId ? (
        <p className="rounded-2xl border border-secondary-200 bg-secondary-50 px-3 py-3 text-xs leading-5 text-secondary-600">
          Reissue is paused for import-sourced handoffs until the authenticated handoff-file recovery workflow is reachable. This protects the only sealed credential deliverable.
        </p>
      ) : state.status !== "success" || !state.handoffId ? (
        <form action={formAction} className="space-y-3">
          <input name="handoffId" type="hidden" value={handoffId} />
          <label className="flex items-start gap-3 text-xs leading-5 text-secondary-600">
            <input className="mt-1 size-4 shrink-0 accent-primary-700" name="confirmation" required type="checkbox" value="reissue" />
            <span>I understand this revokes the current handoff and creates a replacement.</span>
          </label>
          <Button className="min-h-11" disabled={pending} size="sm" type="submit" variant="brandOutline">{pending ? "Reissuing…" : "Reissue handoff"}</Button>
        </form>
      ) : null}
    </div>
  );
}

export { HandoffControls };

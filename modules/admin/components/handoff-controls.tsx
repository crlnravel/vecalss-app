"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { EnrollmentHandoffMethod, EnrollmentHandoffStatus } from "@/generated/prisma/client";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";

import { reissueEnrollmentHandoffAction } from "../actions";
import { HandoffDeliveryNotice } from "./handoff-delivery-notice";

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
    <div className="mt-4 rounded-2xl border border-primary-100 px-4 py-3 text-sm text-secondary-700">
      <p className="font-medium text-secondary-900">Credential handoff</p>
      <p className="mt-1 capitalize">{method.replaceAll("_", " ")} · {status}</p>
      {expiresAt ? (
        <p className="mt-1 text-xs">
          Expires <time dateTime={expiresAt.toISOString()}>{expiresAt.toISOString()}</time>
        </p>
      ) : null}
      {state.message ? <FormNotice tone={state.status === "success" ? "success" : "danger"}>{state.message}</FormNotice> : null}
      {state.handoffId && (state.inviteUrl || state.temporaryPassword) ? <div className="mt-3"><HandoffDeliveryNotice state={state} /></div> : null}
      {sourceImportRowId ? (
        <p className="mt-3 rounded-xl border border-secondary-200 bg-secondary-50 px-3 py-2 text-xs leading-5 text-secondary-600">
          Reissue is paused for import-sourced handoffs until the authenticated handoff-file recovery workflow is reachable. This protects the only sealed credential deliverable.
        </p>
      ) : state.status !== "success" || !state.handoffId ? (
        <form action={formAction} className="mt-3">
          <input name="handoffId" type="hidden" value={handoffId} />
          <label className="mb-3 flex items-start gap-2 text-xs leading-5 text-secondary-600">
            <input className="mt-1" name="confirmation" required type="checkbox" value="reissue" />
            <span>I understand this revokes the current handoff and creates a replacement.</span>
          </label>
          <Button className="min-h-11" disabled={pending} size="sm" type="submit" variant="brandOutline">{pending ? "Reissuing…" : "Reissue handoff"}</Button>
        </form>
      ) : null}
    </div>
  );
}

export { HandoffControls };

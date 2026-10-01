"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldRequiredMark } from "@/components/ui/field";
import { useActionToast } from "@/components/ui/use-action-toast";
import type { EnrollmentHandoffMethod } from "@/generated/prisma/client";
import { acknowledgeEnrollmentHandoffAction } from "@/modules/admin/actions";
import type { FormState } from "@/modules/auth/form-state";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";
import { FormNotice } from "@/modules/auth/components/form-notice";

function HandoffDeliveryNotice({
  onAcknowledged,
  onRecovery,
  recoveryHref,
  state,
}: {
  onAcknowledged?: () => void;
  onRecovery?: () => void;
  recoveryHref?: string;
  state: FormState;
}) {
  const [acknowledgement, acknowledgeAction, pending] = useActionState(
    acknowledgeEnrollmentHandoffAction,
    EMPTY_FORM_STATE,
  );
  const keepMessageInline = useActionToast(acknowledgement);
  const successHandled = useRef(false);
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const method = state.handoffMethod as EnrollmentHandoffMethod | undefined;
  const secret = method === "invite_link" ? state.inviteUrl : state.temporaryPassword;

  useEffect(() => {
    if (acknowledgement.status !== "success") {
      successHandled.current = false;
      return;
    }

    if (successHandled.current) {
      return;
    }

    successHandled.current = true;
    onAcknowledged?.();
  }, [acknowledgement.status, onAcknowledged]);

  if (!state.handoffId || !secret) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-3xl border border-primary-200 bg-primary-50 p-4 text-sm text-secondary-800">
       <p className="font-medium">Informasi akses sekali pakai</p>
      <p className="break-all font-mono text-xs leading-6">{secret}</p>
      <p className="text-xs leading-5 text-secondary-600">
         Salin dan berikan nilai ini kepada penerima sekarang. Nilai ini hanya ditampilkan sekali.
      </p>
      {acknowledgement.message && keepMessageInline ? (
        <FormNotice tone="danger">
          {acknowledgement.message}
        </FormNotice>
      ) : null}
      {acknowledgement.status !== "success" ? (
        <form action={acknowledgeAction} className="space-y-3">
          <input name="handoffId" type="hidden" value={state.handoffId} />
          <label className="flex items-start gap-2 text-xs leading-5 text-secondary-600">
            <input className="mt-1" name="confirmation" required type="checkbox" value="acknowledge" />
             <span>Saya mengonfirmasi bahwa informasi akses ini sudah diberikan kepada penerima.<FieldRequiredMark /></span>
          </label>
          <Button className="min-h-11" disabled={pending} size="sm" type="submit" variant="outline">
             {pending ? "Menyimpan…" : "Konfirmasi pemberian akses"}
          </Button>
        </form>
      ) : null}
      {acknowledgement.status === "error" ? (
        <div className="space-y-3 rounded-2xl border border-student-status-danger-border bg-white/60 p-3 text-xs leading-5 text-secondary-700">
          <p>
             Informasi akses ini perlu diperiksa sebelum dibagikan. Tautannya mungkin sudah kedaluwarsa atau diganti; periksa detail akun sebelum membagikannya.
          </p>
          {recoveryHref ? (
            <Button
              nativeButton={false}
              render={<Link href={recoveryHref} />}
              size="sm"
              variant="outline"
            >
               Buka detail akun
            </Button>
          ) : null}
          {onRecovery ? (
            <>
              <label className="flex items-start gap-2">
                <input
                  checked={recoveryConfirmed}
                  className="mt-1"
                  onChange={(event) => setRecoveryConfirmed(event.target.checked)}
                  type="checkbox"
                />
                 <span>Saya akan memeriksa detail akun dan memastikan akses ini masih berlaku sebelum membagikannya.<FieldRequiredMark /></span>
              </label>
              <Button
                className="min-h-10"
                disabled={!recoveryConfirmed}
                onClick={onRecovery}
                size="sm"
                type="button"
                variant="outline"
              >
                 Tutup setelah tindak lanjut direncanakan
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export { HandoffDeliveryNotice };

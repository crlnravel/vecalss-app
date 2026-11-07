"use client";

import Link from "next/link";
import { useActionState } from "react";

import { useActionToast } from "@/components/ui/use-action-toast";

import { EMPTY_FORM_STATE } from "../form-state";
import { verifyEmailAction } from "../registration-actions";
import { FormNotice } from "./form-notice";
import { SubmitButton } from "./submit-button";

function VerifyEmailForm({
  referral,
  resendHref,
  returnTo,
  token,
}: {
  referral?: string | null;
  resendHref: string;
  returnTo?: string | null;
  token: string;
}) {
  const [state, formAction] = useActionState(verifyEmailAction, EMPTY_FORM_STATE);
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-5">
      <input name="token" type="hidden" value={token} />
      {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
      {referral ? <input name="ref" type="hidden" value={referral} /> : null}

      {state.status === "error" && state.message ? (
        <FormNotice showLabel={false} tone="danger">
          {state.message}{" "}
          <Link className="font-semibold underline underline-offset-4" href={resendHref}>
            Kirim ulang tautan
          </Link>
          .
        </FormNotice>
      ) : null}

      <SubmitButton className="w-full" pendingLabel="Memverifikasi..." size="lg" type="submit" variant="default">
        Verifikasi email
      </SubmitButton>
    </form>
  );
}

export { VerifyEmailForm };

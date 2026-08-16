"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";

import { FormNotice } from "./form-notice";

const INVALID_INVITE_MESSAGE = "This invite link is invalid or has already expired.";

function InvitePasswordSetupForm({ token }: { token: string }) {
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!password || !confirmPassword) {
      setMessage("Enter and confirm your new password.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("The confirmation does not match your new password.");
      return;
    }

    setMessage(null);
    setSubmitting(true);

    try {
      const response = await fetch(`/api/invite/${encodeURIComponent(token)}`, {
        body: JSON.stringify({ confirmPassword, password }),
        cache: "no-store",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        method: "POST",
        referrerPolicy: "no-referrer",
      });

      if (!response.ok) {
        setMessage(INVALID_INVITE_MESSAGE);
        return;
      }

      window.location.assign("/login?notice=invite-completed");
    } catch {
      setMessage(INVALID_INVITE_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {message ? <FormNotice tone="danger">{message}</FormNotice> : null}

      <Field>
        <FieldLabel htmlFor="invite-password">New password</FieldLabel>
        <FieldInput
          autoComplete="new-password"
          id="invite-password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 8 characters"
          required
          type="password"
          value={password}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="invite-password-confirmation">Confirm password</FieldLabel>
        <FieldInput
          autoComplete="new-password"
          id="invite-password-confirmation"
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Repeat your new password"
          required
          type="password"
          value={confirmPassword}
        />
      </Field>

      <Button
        aria-disabled={submitting}
        disabled={submitting}
        size="lg"
        type="submit"
        variant="brand"
      >
        {submitting ? "Activating account..." : "Set password and activate"}
      </Button>
    </form>
  );
}

export { InvitePasswordSetupForm };

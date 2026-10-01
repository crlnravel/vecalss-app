"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";

import { FormNotice } from "./form-notice";
import { PASSWORD_REQUIREMENTS_COPY } from "../password-copy";
import { INVALID_INVITE_MESSAGE } from "../invite-copy";

function InvitePasswordSetupForm({ token }: { token: string }) {
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!password || !confirmPassword) {
      setMessage("Isi kata sandi baru dan ulangi untuk konfirmasi.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Kata sandi yang kamu masukkan belum sama. Periksa kembali.");
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
        setMessage("Undangan belum berhasil diproses. Coba lagi atau hubungi admin jika masalah berlanjut.");
        return;
      }

      window.location.assign("/login?notice=invite-completed");
    } catch {
      setMessage("Koneksi bermasalah. Periksa koneksi lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {message ? <FormNotice tone="danger">{message}</FormNotice> : null}

      <Field>
        <FieldLabel htmlFor="invite-password">Kata sandi baru</FieldLabel>
        <FieldInput
          autoComplete="new-password"
          id="invite-password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Minimal 8 karakter"
          required
          type="password"
          value={password}
        />
        <p className="text-sm text-secondary-600">{PASSWORD_REQUIREMENTS_COPY}</p>
      </Field>

      <Field>
        <FieldLabel htmlFor="invite-password-confirmation">Konfirmasi kata sandi</FieldLabel>
        <FieldInput
          autoComplete="new-password"
          id="invite-password-confirmation"
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Ulangi kata sandi baru"
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
        variant="default"
      >
        {submitting ? "Mengaktifkan akun..." : "Simpan kata sandi dan aktifkan akun"}
      </Button>
    </form>
  );
}

export { InvitePasswordSetupForm };

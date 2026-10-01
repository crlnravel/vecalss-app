"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { showToast } from "@/components/ui/toast";
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";

import { FormNotice } from "./form-notice";
import { PASSWORD_REQUIREMENTS_COPY } from "../password-copy";

function InvitePasswordSetupForm({ token }: { token: string }) {
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  usePageStatusToast({ active: submitting, message: "Mengaktifkan akun…", variant: "info" });

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
        showToast("Undangan belum berhasil diproses.", {
          action: { label: "Coba lagi", onClick: () => formRef.current?.requestSubmit() },
          description: "Coba lagi. Jika masalah berlanjut, hubungi admin.",
          variant: "error",
        });
        return;
      }

      window.location.assign("/login?notice=invite-completed");
    } catch {
      showToast("Koneksi bermasalah.", {
        action: { label: "Coba lagi", onClick: () => formRef.current?.requestSubmit() },
        description: "Periksa koneksi lalu coba lagi.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} ref={formRef}>
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

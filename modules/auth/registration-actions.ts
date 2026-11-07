"use server";

import { redirect } from "next/navigation";

import { postVerificationReturnTo, readContinuation } from "@/lib/registration/links";
import {
  registerStudent,
  resendVerification,
  verifyEmail,
  type SignupFieldErrors,
} from "@/lib/registration/service";

import type { FormState } from "./form-state";
import { readPasswordField, readTextField } from "./form-fields";
import { describePasswordViolation } from "./password-copy";

const CLOSED_MESSAGE = "Pendaftaran mandiri belum dibuka. Untuk saat ini, akun dibuat oleh tim PTN Pro.";
const UNAVAILABLE_MESSAGE = "Permintaanmu belum bisa diproses saat ini. Coba lagi beberapa saat lagi.";
const CHALLENGE_MESSAGE = "Pemeriksaan keamanan belum berhasil. Tunggu kotak pemeriksaan selesai, lalu coba lagi.";

function describeSignupErrors(errors: SignupFieldErrors) {
  const fieldErrors: Record<string, string> = {};
  if (errors.fullName) fieldErrors.fullName = "Tulis nama lengkapmu, minimal 2 huruf.";
  if (errors.email) fieldErrors.email = "Periksa penulisan emailmu. Contohnya nama@email.com.";
  if (errors.ageConfirmed) fieldErrors.ageConfirmed = "Centang pernyataan ini untuk melanjutkan.";
  return fieldErrors;
}

/**
 * Starts a signup. The answer is the same for a new address, an address that already has an
 * account and a refused attempt; only the email the address's owner gets differs.
 */
async function registerStudentAction(_previousState: FormState, formData: FormData): Promise<FormState> {
  const fullName = readTextField(formData, "fullName");
  const email = readTextField(formData, "email");
  const continuation = readContinuation({ ref: formData.get("ref"), returnTo: formData.get("returnTo") });
  const kept = { email, fullName };

  const outcome = await registerStudent({
    ageConfirmed: formData.get("ageConfirmed") === "yes",
    email,
    fullName,
    ref: continuation.ref,
    returnTo: continuation.returnTo,
    turnstileToken: readTextField(formData, "cf-turnstile-response") || null,
  });

  switch (outcome.status) {
    case "accepted": {
      const params = new URLSearchParams();
      if (continuation.returnTo) params.set("returnTo", continuation.returnTo);
      if (continuation.ref) params.set("ref", continuation.ref);
      // Local development only: no mailbox is involved, so the link is passed on to be shown.
      if (outcome.deliveredVerificationUrl) params.set("dev", outcome.deliveredVerificationUrl);
      const query = params.toString();
      redirect(`/daftar/periksa-email${query ? `?${query}` : ""}`);
    }
    case "closed":
      return { fields: kept, message: CLOSED_MESSAGE, status: "error" };
    case "invalid":
      return {
        fieldErrors: describeSignupErrors(outcome.errors),
        fields: kept,
        message: "Periksa lagi isian yang ditandai, lalu coba kirim ulang.",
        status: "error",
      };
    case "challenge_failed":
      return { fields: kept, message: CHALLENGE_MESSAGE, status: "error" };
    case "rate_limited":
      return {
        fields: kept,
        message: "Terlalu banyak percobaan mendaftar dari sini. Coba lagi dalam satu jam.",
        status: "error",
      };
    case "unavailable":
      return { fields: kept, message: UNAVAILABLE_MESSAGE, status: "error" };
  }
}

/** Sends the verification link again. Same answer whether or not the address has a pending signup. */
async function resendVerificationAction(_previousState: FormState, formData: FormData): Promise<FormState> {
  const email = readTextField(formData, "email");
  const continuation = readContinuation({ ref: formData.get("ref"), returnTo: formData.get("returnTo") });

  if (!email) {
    return {
      fieldErrors: { email: "Masukkan email yang kamu pakai untuk mendaftar." },
      fields: { email },
      message: "Masukkan email yang kamu pakai untuk mendaftar.",
      status: "error",
    };
  }

  const outcome = await resendVerification({ email, ref: continuation.ref, returnTo: continuation.returnTo });

  switch (outcome.status) {
    case "accepted":
      return {
        fields: { email: "" },
        message: "Kalau email itu punya pendaftaran yang belum diverifikasi, kami sudah mengirim tautan baru. Periksa kotak masuk dan folder spam. Tautannya berlaku 24 jam.",
        status: "success",
        verifyUrl: outcome.deliveredVerificationUrl ?? undefined,
      };
    case "closed":
      return { fields: { email }, message: CLOSED_MESSAGE, status: "error" };
    case "invalid":
      return {
        fieldErrors: { email: "Periksa penulisan emailmu. Contohnya nama@email.com." },
        fields: { email },
        message: "Periksa penulisan emailmu.",
        status: "error",
      };
    case "rate_limited":
      return {
        fields: { email },
        message: "Terlalu banyak permintaan kirim ulang. Coba lagi dalam satu jam.",
        status: "error",
      };
    case "unavailable":
      return { fields: { email }, message: UNAVAILABLE_MESSAGE, status: "error" };
  }
}

/** The button on the verification page. Only a POST like this one ever uses a link. */
async function verifyEmailAction(_previousState: FormState, formData: FormData): Promise<FormState> {
  const token = readTextField(formData, "token");
  const continuation = readContinuation({ ref: formData.get("ref"), returnTo: formData.get("returnTo") });

  if (!token) {
    return { message: "Tautan ini tidak valid atau sudah kedaluwarsa. Kirim ulang tautan verifikasi.", status: "error" };
  }

  const outcome = await verifyEmail(token, readPasswordField(formData, "password"));

  if (outcome.status === "invalid_password") {
    return { status: "error", fieldErrors: { password: describePasswordViolation(outcome.violation) }, message: "Periksa kata sandimu, lalu coba lagi." };
  }

  if (outcome.status === "verified") {
    const params = new URLSearchParams({ notice: "email-verified" });
    const returnTo = postVerificationReturnTo(continuation);
    if (returnTo) params.set("returnTo", returnTo);
    redirect(`/login?${params}`);
  }

  if (outcome.status === "unavailable") return { message: UNAVAILABLE_MESSAGE, status: "error" };

  return {
    message: "Tautan ini tidak valid atau sudah kedaluwarsa. Kirim ulang tautan verifikasi.",
    status: "error",
  };
}

export { registerStudentAction, resendVerificationAction, verifyEmailAction };

"use server";

import { redirect } from "next/navigation";

import { PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";
import {
  getDefaultHomePath,
  getLoginPathForAudience,
  requireSession,
} from "@/lib/auth/access";
import { getSafeAdminReturnPath } from "@/lib/auth/paths";
import {
  changePasswordForUser,
  completePasswordReset,
  getValidPasswordResetRecord,
  requestPasswordReset,
  authenticateUser,
} from "@/lib/auth/service";
import { revokeCurrentSession } from "@/lib/auth/session";
import type { LoginAudience } from "@/lib/auth/types";

import type { FormState } from "./form-state";

function readTextField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function withFieldError(
  fields: Record<string, string>,
  message: string,
  fieldErrors: Record<string, string>,
): FormState {
  return {
    fieldErrors,
    fields,
    message,
    status: "error",
  };
}

function readAudience(formData: FormData): LoginAudience {
  const value = formData.get("audience");
  if (value === "admin" || value === "tutor" || value === "affiliator" || value === "developer") {
    return value;
  }

  return "student";
}

function getChangePasswordErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === "Password must include uppercase, lowercase, and number characters.") {
    return "Kata sandi baru harus memuat huruf besar, huruf kecil, dan angka.";
  }

  if (error instanceof Error && error.message === `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`) {
    return `Kata sandi baru harus terdiri dari minimal ${PASSWORD_MIN_LENGTH} karakter.`;
  }

  return "Kata sandi belum berhasil diperbarui. Coba lagi beberapa saat lagi.";
}

function getResetPasswordErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === "This reset link is invalid or has already expired.") {
    return "Tautan ini tidak valid atau sudah kedaluwarsa. Minta tautan baru untuk mengatur ulang kata sandi.";
  }

  return getChangePasswordErrorMessage(error);
}

async function handleLoginAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = readTextField(formData, "email");
  const password = readTextField(formData, "password");

  if (!email || !password) {
    return withFieldError(
      { email },
      "Masukkan email dan kata sandi untuk masuk.",
      {
        ...(email ? {} : { email: "Masukkan email akunmu." }),
        ...(password ? {} : { password: "Masukkan kata sandi." }),
      },
    );
  }

  const result = await authenticateUser(email, password);

  if (!result.ok) {
    if (result.code === "service_unavailable") {
      return {
        fields: { email },
        message: "Kamu belum bisa masuk saat ini. Coba lagi beberapa saat lagi.",
        status: "error",
      };
    }

    if (result.code === "locked") {
      return {
        fields: { email },
        message:
          "Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.",
        status: "error",
      };
    }

    return {
      fields: { email },
      message: "Email atau kata sandi belum cocok. Periksa kembali, lalu coba lagi.",
      status: "error",
    };
  }

  const destination = !result.user.mustChangePassword
    ? getSafeAdminReturnPath(formData.get("returnTo"))
    : null;
  redirect(destination ?? getDefaultHomePath(result.user));
}

/**
 * The public login page accepts any active Vecalss role. The authenticated
 * user's role assignments determine the destination through getDefaultHomePath.
 */
async function loginAction(previousState: FormState, formData: FormData): Promise<FormState> {
  return handleLoginAction(previousState, formData);
}

async function forgotPasswordAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = readTextField(formData, "email");
  const audience = readAudience(formData);

  if (!email) {
    return withFieldError(
      { email },
      "Masukkan email yang terhubung dengan akun Vecalss.",
      { email: "Masukkan email akunmu." },
    );
  }

  try {
    const result = await requestPasswordReset(email, audience);

    return {
      fields: { email: "" },
      message: result.deliveredResetUrl
        ? "Tautan pengaturan ulang kata sandi sudah siap. Buka tautan di bawah untuk melanjutkan."
        : "Tautan pengaturan ulang belum tersedia di halaman ini. Hubungi admin Vecalss untuk meminta bantuan.",
      resetUrl: result.deliveredResetUrl ?? undefined,
      status: "success",
    };
  } catch (error) {
    console.error("Failed to request password reset", error);

    return {
      fields: { email },
      message: "Permintaan pengaturan ulang kata sandi belum berhasil diproses. Coba lagi beberapa saat lagi.",
      status: "error",
    };
  }
}

async function resetPasswordAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const audience = readAudience(formData);
  const token = readTextField(formData, "token");
  const password = readTextField(formData, "password");
  const confirmPassword = readTextField(formData, "confirmPassword");

  if (!token) {
    return {
      message: "Tautan ini tidak valid atau sudah kedaluwarsa. Minta tautan baru.",
      status: "error",
    };
  }

  if (!password || !confirmPassword) {
    return withFieldError(
      {},
      "Isi kata sandi baru dan ulangi untuk konfirmasi.",
      {
        ...(password ? {} : { password: "Isi kata sandi baru." }),
        ...(confirmPassword ? {} : { confirmPassword: "Ulangi kata sandi baru." }),
      },
    );
  }

  if (password !== confirmPassword) {
    return withFieldError(
      {},
      "Kata sandi yang kamu masukkan belum sama. Periksa kembali.",
      { confirmPassword: "Kata sandi belum sama." },
    );
  }

  try {
    await completePasswordReset(token, password);
  } catch (error) {
    return {
      message: getResetPasswordErrorMessage(error),
      status: "error",
    };
  }

  redirect(`${getLoginPathForAudience(audience)}?notice=password-reset`);
}

async function changePasswordAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const password = readTextField(formData, "password");
  const confirmPassword = readTextField(formData, "confirmPassword");

  if (!password || !confirmPassword) {
    return withFieldError(
      {},
      "Isi kata sandi baru dan ulangi untuk konfirmasi.",
      {
        ...(password ? {} : { password: "Isi kata sandi baru." }),
        ...(confirmPassword ? {} : { confirmPassword: "Ulangi kata sandi baru." }),
      },
    );
  }

  if (password !== confirmPassword) {
    return withFieldError(
      {},
      "Kata sandi yang kamu masukkan belum sama. Periksa kembali.",
      { confirmPassword: "Kata sandi belum sama." },
    );
  }

  try {
    await changePasswordForUser(session.user.id, session.sessionId, password);
  } catch (error) {
    return {
      message: getChangePasswordErrorMessage(error),
      status: "error",
    };
  }

  redirect(getDefaultHomePath({
    ...session.user,
    mustChangePassword: false,
  }));
}

async function logoutAction(formData: FormData) {
  const audience = readAudience(formData);

  await revokeCurrentSession();
  redirect(`${getLoginPathForAudience(audience)}?notice=signed-out`);
}

async function getResetTokenStatus(rawToken: string) {
  const record = await getValidPasswordResetRecord(rawToken);

  return {
    isValid: Boolean(record),
  };
}

export {
  changePasswordAction,
  forgotPasswordAction,
  getResetTokenStatus,
  loginAction,
  logoutAction,
  resetPasswordAction,
};

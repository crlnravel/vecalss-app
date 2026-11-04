"use server";

import { redirect } from "next/navigation";

import { getSupportContact } from "@/lib/config";
import { ensureDeviceCookie } from "@/lib/fraud/device";
import { serverLogger } from "@/lib/server-logger";
import {
  getDefaultHomePath,
  getLoginPathForAudience,
  requireSession,
} from "@/lib/auth/access";
import { getSafeLoginReturnPath } from "@/lib/auth/paths";
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
import { readPasswordField, readTextField } from "./form-fields";
import { describePasswordViolation, isPasswordPolicyError } from "./password-copy";

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
  if (isPasswordPolicyError(error)) {
    return describePasswordViolation(error.violation);
  }

  return "Kata sandi belum berhasil diperbarui. Coba lagi beberapa saat lagi.";
}

function getResetPasswordErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === "This reset link is invalid or has already expired.") {
    return "Tautan ini tidak valid atau sudah kedaluwarsa. Minta tautan baru untuk mengatur ulang kata sandi.";
  }

  return getChangePasswordErrorMessage(error);
}

function isExpectedPasswordActionError(error: unknown) {
  if (isPasswordPolicyError(error)) return true;
  if (!(error instanceof Error)) return false;
  return error.message === "This reset link is invalid or has already expired.";
}

async function handleLoginAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = readTextField(formData, "email");
  const password = readPasswordField(formData, "password");

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

    if (result.code === "blocked") {
      // Neutral on purpose: it names no rule and no identifier.
      return {
        fields: { email },
        message: `Akunmu belum bisa dipakai saat ini. Hubungi tim Vecalss lewat ${getSupportContact().label} supaya kami bisa membantu memeriksanya.`,
        status: "error",
      };
    }

    if (result.code === "rate_limited") {
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

  // The first-party device cookie, so a later checkout from this browser can be
  // recognised. Only an HMAC of it is ever stored.
  try {
    await ensureDeviceCookie();
  } catch (error) {
    serverLogger.error("auth.device_cookie.failed", error, { area: "auth" });
  }

  const destination = !result.user.mustChangePassword
    ? getSafeLoginReturnPath(formData.get("returnTo"))
    : null;
  redirect(destination ?? getDefaultHomePath(result.user));
}

/**
 * The public login page accepts any active PTN Pro role. The authenticated
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
      "Masukkan email yang terhubung dengan akun PTN Pro.",
      { email: "Masukkan email akunmu." },
    );
  }

  try {
    const result = await requestPasswordReset(email, audience);

    return {
      fields: { email: "" },
      // The same message whether or not the address belongs to an account.
      message: "Kalau email itu terdaftar, kami sudah mengirim tautan untuk mengatur ulang kata sandi. Periksa kotak masuk dan folder spam. Tautannya berlaku 15 menit.",
      resetUrl: result.deliveredResetUrl ?? undefined,
      status: "success",
    };
  } catch (error) {
    serverLogger.error("auth.password_reset.request.failed", error, {
      area: "auth",
      operation: "password_reset_request",
    });

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
  const password = readPasswordField(formData, "password");
  const confirmPassword = readPasswordField(formData, "confirmPassword");

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
    if (!isExpectedPasswordActionError(error)) {
      serverLogger.error("auth.password_reset.complete.failed", error, {
        area: "auth",
        operation: "complete_password_reset",
      });
    }
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
  const password = readPasswordField(formData, "password");
  const confirmPassword = readPasswordField(formData, "confirmPassword");

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
    if (!isExpectedPasswordActionError(error)) {
      serverLogger.error("auth.password_change.failed", error, {
        area: "auth",
        operation: "change_password",
      });
    }
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

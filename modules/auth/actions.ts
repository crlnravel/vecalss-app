"use server";

import { redirect } from "next/navigation";

import { OnboardingStatus, RoleName } from "@/generated/prisma/client";
import {
  getDefaultHomePath,
  getLoginPathForAudience,
  requireStudentSession,
} from "@/lib/auth/access";
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
  return value === "admin" ? "admin" : "student";
}

async function handleLoginAction(
  _previousState: FormState,
  formData: FormData,
  requiredRole: RoleName,
): Promise<FormState> {
  const email = readTextField(formData, "email");
  const password = readTextField(formData, "password");

  if (!email || !password) {
    return withFieldError(
      { email },
      "Enter both your email and password to continue.",
      {
        ...(email ? {} : { email: "Email is required." }),
        ...(password ? {} : { password: "Password is required." }),
      },
    );
  }

  const result = await authenticateUser(email, password, {
    requiredRole,
  });

  if (!result.ok) {
    if (result.code === "service_unavailable") {
      return {
        fields: { email },
        message: "We're sorry, sign-in is unavailable right now. Please try again soon.",
        status: "error",
      };
    }

    if (result.code === "locked") {
      return {
        fields: { email },
        message:
          "Your account is temporarily locked after repeated failed attempts. Please wait 15 minutes before trying again.",
        status: "error",
      };
    }

    return {
      fields: { email },
      message:
        requiredRole === RoleName.admin
          ? "Invalid admin credentials. Please confirm your admin access is active and try again."
          : "Invalid credentials. If you have not been enrolled yet, please complete the registration flow first.",
      status: "error",
    };
  }

  redirect(getDefaultHomePath(result.user));
}

async function loginStudentAction(previousState: FormState, formData: FormData): Promise<FormState> {
  return handleLoginAction(previousState, formData, RoleName.student);
}

async function loginAdminAction(previousState: FormState, formData: FormData): Promise<FormState> {
  return handleLoginAction(previousState, formData, RoleName.admin);
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
      "Enter the email tied to your Vecalss account.",
      { email: "Email is required." },
    );
  }

  try {
    const result = await requestPasswordReset(email, audience);

    return {
      fields: { email: "" },
      message:
        "If that account is active, we have prepared a password reset link. In production this message always stays generic.",
      resetUrl: result.deliveredResetUrl ?? undefined,
      status: "success",
    };
  } catch (error) {
    console.error("Failed to request password reset", error);

    return {
      fields: { email },
      message: "We're sorry, we can't send a reset link right now. Please try again soon.",
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
      message: "This reset link is invalid.",
      status: "error",
    };
  }

  if (!password || !confirmPassword) {
    return withFieldError(
      {},
      "Enter and confirm your new password.",
      {
        ...(password ? {} : { password: "New password is required." }),
        ...(confirmPassword ? {} : { confirmPassword: "Confirm your new password." }),
      },
    );
  }

  if (password !== confirmPassword) {
    return withFieldError(
      {},
      "The confirmation does not match your new password.",
      { confirmPassword: "Passwords do not match." },
    );
  }

  try {
    await completePasswordReset(token, password);
    redirect(`${getLoginPathForAudience(audience)}?notice=password-reset`);
  } catch (error) {
    return {
      message:
        error instanceof Error
          ? error.message
          : "We're sorry, this reset link no longer works. Please request a new one.",
      status: "error",
    };
  }
}

async function changePasswordAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireStudentSession({
    allowIncompleteOnboarding: true,
    allowMustChangePassword: true,
  });
  const password = readTextField(formData, "password");
  const confirmPassword = readTextField(formData, "confirmPassword");

  if (!password || !confirmPassword) {
    return withFieldError(
      {},
      "Set and confirm a strong password before continuing.",
      {
        ...(password ? {} : { password: "New password is required." }),
        ...(confirmPassword ? {} : { confirmPassword: "Confirm your new password." }),
      },
    );
  }

  if (password !== confirmPassword) {
    return withFieldError(
      {},
      "The confirmation does not match your new password.",
      { confirmPassword: "Passwords do not match." },
    );
  }

  try {
    await changePasswordForUser(session.user.id, password);

    if (
      session.user.onboardingStatus === OnboardingStatus.not_started
      || session.user.onboardingStatus === null
    ) {
      redirect("/onboarding");
    }

    redirect("/dashboard");
  } catch (error) {
    return {
      message:
        error instanceof Error
          ? error.message
          : "We're sorry, we couldn't update your password. Please try again.",
      status: "error",
    };
  }
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
  loginAdminAction,
  loginStudentAction,
  logoutAction,
  resetPasswordAction,
};

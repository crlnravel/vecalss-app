"use server";

import { redirect } from "next/navigation";

import { OnboardingStatus } from "@/generated/prisma/client";
import {
  getDefaultHomePath,
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

async function loginAction(_previousState: FormState, formData: FormData): Promise<FormState> {
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

  const result = await authenticateUser(email, password);

  if (!result.ok) {
    if (result.code === "service_unavailable") {
      return {
        fields: { email },
        message:
          "The authentication service is temporarily unavailable. Please try again in a moment.",
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
        "Invalid credentials. If you have not been enrolled yet, please complete the registration flow first.",
      status: "error",
    };
  }

  redirect(getDefaultHomePath(result.user));
}

async function forgotPasswordAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = readTextField(formData, "email");

  if (!email) {
    return withFieldError(
      { email },
      "Enter the email tied to your Vecalss account.",
      { email: "Email is required." },
    );
  }

  try {
    const result = await requestPasswordReset(email);

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
      message:
        "We could not prepare a password reset right now. Please try again in a moment.",
      status: "error",
    };
  }
}

async function resetPasswordAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
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
    redirect("/login?notice=password-reset");
  } catch (error) {
    return {
      message:
        error instanceof Error
          ? error.message
          : "We could not reset your password. Please request a fresh reset link.",
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
          : "We could not update your password. Please try again.",
      status: "error",
    };
  }
}

async function logoutAction() {
  await revokeCurrentSession();
  redirect("/login?notice=signed-out");
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

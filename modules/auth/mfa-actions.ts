"use server";

import { redirect, unstable_rethrow } from "next/navigation";

import { getDefaultHomePath, getSafeMfaReturnPath, isMfaPending } from "@/lib/auth/paths";
import { getRequestMetadata } from "@/lib/auth/request";
import {
  confirmEnrollment,
  startEnrollment,
  verifyRecoveryCode,
  verifyTotpChallenge,
  type VerifyFailure,
} from "@/lib/auth/mfa/service";
import { getSessionContext } from "@/lib/auth/session";
import { serverLogger } from "@/lib/server-logger";

import type { FormState } from "./form-state";
import { MFA_COPY } from "./mfa-copy";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function failure(message: string): FormState {
  return { message, status: "error" };
}

/** The signed-in account that still owes a second factor, or null. */
async function getPendingSession() {
  const session = await getSessionContext();
  return session && isMfaPending(session.user) && !session.user.mustChangePassword ? session : null;
}

function failureMessage(reason: VerifyFailure | "expired" | "already_enrolled" | "not_privileged", invalid: string) {
  if (reason === "throttled") return MFA_COPY.throttled;
  if (reason === "unavailable") return MFA_COPY.unexpected;
  if (reason === "expired") return MFA_COPY.enrollmentExpired;
  return invalid;
}

async function destinationAfterVerification(formData: FormData) {
  const returnTo = getSafeMfaReturnPath(formData.get("returnTo"));
  if (returnTo) return returnTo;

  const refreshed = await getSessionContext();
  return refreshed ? getDefaultHomePath(refreshed.user) : "/login";
}

async function evidence() {
  const { ipAddress, userAgent } = await getRequestMetadata();
  return { ipAddress, userAgent };
}

async function setupCodeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const session = await getPendingSession();
  if (!session) redirect("/mfa");

  try {
    const result = await startEnrollment({
      sessionId: session.sessionId,
      setupCode: readText(formData, "setupCode"),
      userId: session.user.id,
    });
    if (!result.ok) return failure(failureMessage(result.reason, MFA_COPY.setupInvalid));
  } catch (error) {
    serverLogger.error("auth.mfa.setup_code.failed", error, { area: "auth", operation: "mfa_setup_code" });
    return failure(MFA_COPY.unexpected);
  }

  const returnTo = getSafeMfaReturnPath(formData.get("returnTo"));
  redirect(returnTo ? `/mfa?${new URLSearchParams({ returnTo })}` : "/mfa");
}

async function confirmEnrollmentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const session = await getPendingSession();
  if (!session) redirect("/mfa");

  try {
    const result = await confirmEnrollment({
      code: readText(formData, "code"),
      evidence: await evidence(),
      sessionId: session.sessionId,
      userId: session.user.id,
    });
    if (!result.ok) {
      if (result.reason === "expired") redirect("/mfa");
      return failure(failureMessage(result.reason, MFA_COPY.codeInvalid));
    }

    return {
      nextPath: await destinationAfterVerification(formData),
      recoveryCodes: result.recoveryCodes,
      status: "success",
    };
  } catch (error) {
    unstable_rethrow(error);
    serverLogger.error("auth.mfa.enrollment.failed", error, { area: "auth", operation: "mfa_enrollment" });
    return failure(MFA_COPY.unexpected);
  }
}

async function challengeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const session = await getPendingSession();
  if (!session) redirect("/mfa");

  try {
    const result = await verifyTotpChallenge({
      code: readText(formData, "code"),
      evidence: await evidence(),
      sessionId: session.sessionId,
      userId: session.user.id,
    });
    if (!result.ok) return failure(failureMessage(result.reason, MFA_COPY.codeInvalid));
  } catch (error) {
    serverLogger.error("auth.mfa.challenge.failed", error, { area: "auth", operation: "mfa_challenge" });
    return failure(MFA_COPY.unexpected);
  }

  redirect(await destinationAfterVerification(formData));
}

async function recoveryCodeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const session = await getPendingSession();
  if (!session) redirect("/mfa");

  try {
    const result = await verifyRecoveryCode({
      code: readText(formData, "recoveryCode"),
      evidence: await evidence(),
      sessionId: session.sessionId,
      userId: session.user.id,
    });
    if (!result.ok) return failure(failureMessage(result.reason, MFA_COPY.recoveryInvalid));
  } catch (error) {
    serverLogger.error("auth.mfa.recovery.failed", error, { area: "auth", operation: "mfa_recovery" });
    return failure(MFA_COPY.unexpected);
  }

  redirect(await destinationAfterVerification(formData));
}

export { challengeAction, confirmEnrollmentAction, recoveryCodeAction, setupCodeAction };

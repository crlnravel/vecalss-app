import { redirect } from "next/navigation";

import { OnboardingStatus, RoleName } from "@/generated/prisma/client";
import { isAdminStudentPreviewEnabled } from "@/lib/config";
import {
  AdminStudentPreviewUnavailableError,
  createAdminStudentPreviewContext,
  requireAdminStudentPreviewSubject,
} from "@/lib/admin/student-preview";

import {
  getDefaultHomePath,
  getLoginPathForAudience,
} from "./paths";
import { getReadOnlySessionContext, getSessionContext, hasRole } from "./session";
import type { AuthenticatedUser, SessionContext } from "./types";

async function requireSession(loginPath = getLoginPathForAudience("student")) {
  const session = await getSessionContext();

  if (!session) {
    redirect(loginPath);
  }

  return session;
}

async function requireAdminSession(loginPath = getLoginPathForAudience("admin")) {
  const session = await requireSession(loginPath);

  if (!hasRole(session, RoleName.admin)) {
    // Permission contract: an authenticated non-admin returns to their authorized home.
    redirect(getDefaultHomePath(session.user));
  }

  return session;
}

async function requireAdminReadOnlySession() {
  const session = await getReadOnlySessionContext();

  if (!session) {
    redirect(getLoginPathForAudience("admin"));
  }

  if (!hasRole(session, RoleName.admin)) {
    redirect(getDefaultHomePath(session.user));
  }

  return session;
}

/**
 * Preview pages and every future preview loader/action should use this
 * capability boundary. It checks the feature flag before resolving any
 * student data, then authenticates the admin actor, and finally resolves the
 * fixed preview subject by its server-side purpose marker.
 */
function assertAdminStudentPreviewEnabled() {
  if (!isAdminStudentPreviewEnabled()) {
    throw new AdminStudentPreviewUnavailableError(
      "feature_disabled",
      "Student preview is currently unavailable.",
    );
  }
}

async function requireAdminStudentPreviewContext() {
  assertAdminStudentPreviewEnabled();
  const session = await requireAdminReadOnlySession();
  const subject = await requireAdminStudentPreviewSubject();

  return createAdminStudentPreviewContext({ session, subject });
}

async function requireStudentSession({
  allowIncompleteOnboarding = false,
  allowMustChangePassword = false,
}: {
  allowIncompleteOnboarding?: boolean;
  allowMustChangePassword?: boolean;
} = {}) {
  const session = await requireSession();

  if (!hasRole(session, RoleName.student)) {
    redirect(getDefaultHomePath(session.user));
  }

  if (!allowMustChangePassword && session.user.mustChangePassword) {
    redirect("/change-password");
  }

  if (
    !allowIncompleteOnboarding
    && (session.user.onboardingStatus === OnboardingStatus.not_started || session.user.onboardingStatus === null)
  ) {
    redirect("/onboarding");
  }

  return session;
}

async function requireTutorSession({
  allowMustChangePassword = false,
}: {
  allowMustChangePassword?: boolean;
} = {}) {
  const session = await requireSession(getLoginPathForAudience("tutor"));

  if (!hasRole(session, RoleName.tutor)) {
    redirect(getDefaultHomePath(session.user));
  }

  if (!allowMustChangePassword && session.user.mustChangePassword) {
    redirect("/change-password");
  }

  return session;
}

function redirectToAuthorizedHome(user: AuthenticatedUser) {
  redirect(getDefaultHomePath(user));
}

function redirectIfOnboardingAlreadyComplete(session: SessionContext) {
  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  if (
    session.user.onboardingStatus === OnboardingStatus.completed
    || session.user.onboardingStatus === OnboardingStatus.skipped
  ) {
    redirect("/dashboard");
  }
}

export {
  getDefaultHomePath,
  getLoginPathForAudience,
  assertAdminStudentPreviewEnabled,
  redirectIfOnboardingAlreadyComplete,
  redirectToAuthorizedHome,
  requireAdminStudentPreviewContext,
  requireAdminSession,
  requireAdminReadOnlySession,
  requireSession,
  requireStudentSession,
  requireTutorSession,
};

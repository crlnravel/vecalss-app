import { redirect } from "next/navigation";

import { OnboardingStatus, RoleName } from "@/generated/prisma/client";

import {
  getDefaultHomePath,
  getLoginPathForAudience,
} from "./paths";
import { getSessionContext, hasRole } from "./session";
import type { AuthenticatedUser, SessionContext } from "./types";

async function requireSession(loginPath = getLoginPathForAudience("student")) {
  const session = await getSessionContext();

  if (!session) {
    redirect(loginPath);
  }

  return session;
}

async function requireAdminSession() {
  const session = await requireSession(getLoginPathForAudience("admin"));

  if (!hasRole(session, RoleName.admin)) {
    redirect(getDefaultHomePath(session.user));
  }

  return session;
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
  redirectIfOnboardingAlreadyComplete,
  redirectToAuthorizedHome,
  requireAdminSession,
  requireSession,
  requireStudentSession,
  requireTutorSession,
};

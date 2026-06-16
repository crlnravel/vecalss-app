import { redirect } from "next/navigation";

import { OnboardingStatus, RoleName } from "@/generated/prisma/client";

import { getSessionContext, hasRole } from "./session";
import type { AuthenticatedUser, SessionContext } from "./types";

function getStudentHomePath(user: AuthenticatedUser) {
  if (user.mustChangePassword) {
    return "/change-password";
  }

  if (user.onboardingStatus === OnboardingStatus.not_started || user.onboardingStatus === null) {
    return "/onboarding";
  }

  return "/dashboard";
}

function getDefaultHomePath(user: AuthenticatedUser) {
  if (user.roles.includes(RoleName.admin)) {
    return "/admin/enrollment";
  }

  if (user.roles.includes(RoleName.student)) {
    return getStudentHomePath(user);
  }

  return "/login";
}

async function requireSession() {
  const session = await getSessionContext();

  if (!session) {
    redirect("/login");
  }

  return session;
}

async function requireAdminSession() {
  const session = await requireSession();

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
  getStudentHomePath,
  redirectIfOnboardingAlreadyComplete,
  redirectToAuthorizedHome,
  requireAdminSession,
  requireSession,
  requireStudentSession,
};

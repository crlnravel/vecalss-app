import { OnboardingStatus, RoleName } from "@/generated/prisma/client";

import type { AuthenticatedUser, LoginAudience } from "./types";

function getLoginPathForAudience(audience: LoginAudience) {
  return audience === "admin" ? "/admin/login" : "/login";
}

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

  return getLoginPathForAudience("student");
}

export { getDefaultHomePath, getLoginPathForAudience, getStudentHomePath };

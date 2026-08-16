import { OnboardingStatus, RoleName } from "@/generated/prisma/client";

import type { AuthenticatedUser, LoginAudience } from "./types";

function getLoginPathForAudience(audience: LoginAudience) {
  void audience;
  return "/login";
}

function getSafeAdminReturnPath(value: unknown) {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (
    !(path === "/admin" || path.startsWith("/admin/"))
    || path.startsWith("//")
    || path.includes("\\")
    || path === "/admin/login"
    || path.startsWith("/admin/login?")
  ) {
    return null;
  }
  return path;
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

function getTutorHomePath(user: AuthenticatedUser) {
  if (user.mustChangePassword) {
    return "/change-password";
  }

  return "/mentor/dashboard";
}

function getDefaultHomePath(user: AuthenticatedUser) {
  if (user.roles.includes(RoleName.admin)) {
    return "/admin";
  }

  if (user.roles.includes(RoleName.tutor)) {
    return getTutorHomePath(user);
  }

  if (user.roles.includes(RoleName.student)) {
    return getStudentHomePath(user);
  }

  return getLoginPathForAudience("student");
}

export {
  getDefaultHomePath,
  getLoginPathForAudience,
  getSafeAdminReturnPath,
  getStudentHomePath,
  getTutorHomePath,
};

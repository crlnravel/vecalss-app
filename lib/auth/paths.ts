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

function getAffiliatorHomePath(user: AuthenticatedUser) {
  if (user.mustChangePassword) {
    return "/change-password";
  }

  return "/affiliator/dashboard";
}

function getDeveloperHomePath(user: AuthenticatedUser) {
  if (user.mustChangePassword) {
    return "/change-password";
  }

  return "/developer/reports";
}

function getDefaultHomePath(user: AuthenticatedUser) {
  if (user.roles.includes(RoleName.admin)) {
    return "/admin";
  }

  if (user.roles.includes(RoleName.developer)) {
    return getDeveloperHomePath(user);
  }

  if (user.roles.includes(RoleName.affiliator)) {
    return getAffiliatorHomePath(user);
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
  getAffiliatorHomePath,
  getDeveloperHomePath,
  getLoginPathForAudience,
  getSafeAdminReturnPath,
  getStudentHomePath,
  getTutorHomePath,
};

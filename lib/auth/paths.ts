import { OnboardingStatus, RoleName } from "@/generated/prisma/client";

import type { AuthenticatedUser, LoginAudience } from "./types";

function getLoginPathForAudience(audience: LoginAudience) {
  if (audience === "admin") {
    return "/admin/login";
  }

  if (audience === "tutor") {
    return "/mentor/login";
  }

  return "/login";
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
    return "/admin/enrollment";
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
  getStudentHomePath,
  getTutorHomePath,
};

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

function getSafePricingReturnPath(value: unknown) {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (
    !/^\/pricing(?:\/checkout)?(?:\?[A-Za-z0-9=&%._~+-]*)?$/u.test(path)
    || path.startsWith("//")
  ) {
    return null;
  }
  return path;
}

/** Return targets the login form may redirect to after a successful sign-in. */
function getSafeLoginReturnPath(value: unknown) {
  return getSafeAdminReturnPath(value) ?? getSafePricingReturnPath(value);
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

/** Sign-in and re-verification screen for admin and developer accounts. */
const MFA_PATH = "/mfa";

/** Set by proxy.ts on admin and developer pages so a guard can remember where the person was. */
const MFA_RETURN_PATH_HEADER = "x-vecalss-return-path";

function isMfaPending(user: AuthenticatedUser) {
  return user.mfaStatus === "enroll" || user.mfaStatus === "challenge" || user.mfaStatus === "unavailable";
}

/**
 * Where a guard sends a signed-in account whose privileged roles are withheld.
 * A forced password change still comes first, then the second factor.
 */
function getMfaGatePath(user: AuthenticatedUser, returnTo?: string | null) {
  if (user.mustChangePassword) return "/change-password";
  const safeReturn = getSafeMfaReturnPath(returnTo);
  return safeReturn ? `${MFA_PATH}?${new URLSearchParams({ returnTo: safeReturn })}` : MFA_PATH;
}

/**
 * Pages an admin or developer may be returned to after verifying. Anything
 * else (other hosts, other areas, the verification screen itself) is dropped.
 */
function getSafeMfaReturnPath(value: unknown) {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (
    !/^\/(?:admin|developer)(?:[/?][^\s\\]*)?$/u.test(path)
    || path.startsWith("//")
    || path.includes("\\")
  ) {
    return null;
  }
  return path;
}

function getDefaultHomePath(user: AuthenticatedUser) {
  if (isMfaPending(user)) {
    return getMfaGatePath(user);
  }

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
  MFA_PATH,
  MFA_RETURN_PATH_HEADER,
  getDefaultHomePath,
  isMfaPending,
  getAffiliatorHomePath,
  getDeveloperHomePath,
  getLoginPathForAudience,
  getMfaGatePath,
  getSafeAdminReturnPath,
  getSafeLoginReturnPath,
  getSafeMfaReturnPath,
  getSafePricingReturnPath,
  getStudentHomePath,
  getTutorHomePath,
};

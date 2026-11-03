import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OnboardingStatus, RoleName } from "@/generated/prisma/client";
import { isAdminStudentPreviewEnabled } from "@/lib/config";
import {
  AdminStudentPreviewUnavailableError,
  createAdminStudentPreviewContext,
  requireAdminStudentPreviewSubject,
} from "@/lib/admin/student-preview";

import {
  MFA_RETURN_PATH_HEADER,
  getDefaultHomePath,
  getLoginPathForAudience,
  getMfaGatePath,
  isMfaPending,
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

/**
 * An admin or developer who has not passed the second factor is signed in but
 * unprivileged: their context carries neither role. Send them to the
 * verification screen (a forced password change still comes first), remembering
 * the page they were on when the request carries it.
 */
async function redirectIfMfaPending(session: SessionContext, allowMustChangePassword = false) {
  if (!isMfaPending(session.user)) return;

  let returnTo: string | null = null;
  try {
    returnTo = (await headers()).get(MFA_RETURN_PATH_HEADER);
  } catch {
    // No request scope (for example a unit test): fall back to the home page.
  }

  const target = getMfaGatePath(
    allowMustChangePassword ? { ...session.user, mustChangePassword: false } : session.user,
    returnTo,
  );
  redirect(target);
}

async function requireAdminSession(
  loginPath = getLoginPathForAudience("admin"),
  { allowMustChangePassword = false }: { allowMustChangePassword?: boolean } = {},
) {
  const session = await requireSession(loginPath);
  await redirectIfMfaPending(session, allowMustChangePassword);

  if (!hasRole(session, RoleName.admin)) {
    // Permission contract: an authenticated non-admin returns to their authorized home.
    redirect(getDefaultHomePath(session.user));
  }

  // An admin still on a temporary or reset password must replace it first,
  // exactly like every other role.
  if (!allowMustChangePassword && session.user.mustChangePassword) {
    redirect("/change-password");
  }

  return session;
}

async function requireAdminReadOnlySession() {
  const session = await getReadOnlySessionContext();

  if (!session) {
    redirect(getLoginPathForAudience("admin"));
  }

  await redirectIfMfaPending(session);

  if (!hasRole(session, RoleName.admin)) {
    redirect(getDefaultHomePath(session.user));
  }

  if (session.user.mustChangePassword) {
    redirect("/change-password");
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
      "Pratinjau siswa sedang tidak tersedia.",
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

async function requireAffiliatorSession({
  allowMustChangePassword = false,
}: {
  allowMustChangePassword?: boolean;
} = {}) {
  const session = await requireSession(getLoginPathForAudience("affiliator"));

  if (!hasRole(session, RoleName.affiliator)) {
    redirect(getDefaultHomePath(session.user));
  }

  if (!allowMustChangePassword && session.user.mustChangePassword) {
    redirect("/change-password");
  }

  return session;
}

async function requireDeveloperSession({
  allowMustChangePassword = false,
}: {
  allowMustChangePassword?: boolean;
} = {}) {
  const session = await requireSession(getLoginPathForAudience("developer"));
  await redirectIfMfaPending(session, allowMustChangePassword);

  if (!hasRole(session, RoleName.developer)) {
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
  requireAffiliatorSession,
  requireDeveloperSession,
  requireSession,
  requireStudentSession,
  requireTutorSession,
};

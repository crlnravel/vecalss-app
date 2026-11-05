import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OnboardingStatus, RoleName } from "@/generated/prisma/client";
import { isAdminStudentPreviewEnabled } from "@/lib/config";
import { PaidUseEvidenceUnavailableError, enterPaidSurface } from "@/lib/billing/enforcement";
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

/**
 * A signed-in user whose temporary or reset password is still in place gets
 * nothing but the change-password page. For staff helpers that check a role
 * themselves (a capability, say) instead of going through requireTutorSession or
 * requireAdminSession, which already do this.
 */
async function requirePasswordSettledSession(loginPath = getLoginPathForAudience("student")) {
  const session = await requireSession(loginPath);

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  return session;
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

/** Where a student without paid access is sent from every paid surface. */
const PAID_ACCESS_PATH = "/akses-paket";

/**
 * Every student surface is a paid one unless it says otherwise, so a new page or
 * action is covered by default. `allowUnpaid` is for the few places a student
 * needs whatever their package: onboarding, account settings, notifications and
 * the page that explains the missing package. The check only applies once
 * PAID_ACCESS_ENFORCED is on; until then nothing changes for students.
 */
async function requireStudentSession({
  allowIncompleteOnboarding = false,
  allowMustChangePassword = false,
  allowUnpaid = false,
}: {
  allowIncompleteOnboarding?: boolean;
  allowMustChangePassword?: boolean;
  allowUnpaid?: boolean;
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

  if (!allowUnpaid) {
    try {
      if (!(await enterPaidSurface(session.user.id))) redirect(PAID_ACCESS_PATH);
    } catch (error) {
      if (error instanceof PaidUseEvidenceUnavailableError) redirect(`${PAID_ACCESS_PATH}?notice=try-again`);
      throw error;
    }
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
  PAID_ACCESS_PATH,
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
  requirePasswordSettledSession,
  requireSession,
  requireStudentSession,
  requireTutorSession,
};

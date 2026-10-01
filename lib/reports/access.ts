import { RoleName } from "@/generated/prisma/client";

function hasDeveloperReportAccess(
  roles: readonly RoleName[] | null | undefined,
  mustChangePassword = false,
) {
  return !mustChangePassword && (roles?.includes(RoleName.developer) ?? false);
}

function hasTutorReportSubmissionAccess(
  roles: readonly RoleName[] | null | undefined,
  mustChangePassword = false,
) {
  return !mustChangePassword && (roles?.includes(RoleName.tutor) ?? false);
}

export { hasDeveloperReportAccess, hasTutorReportSubmissionAccess };

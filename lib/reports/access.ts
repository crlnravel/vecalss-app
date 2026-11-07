import { RoleName } from "@/generated/prisma/client";

function hasAdminReportAccess(
  roles: readonly RoleName[] | null | undefined,
  mustChangePassword = false,
) {
  return !mustChangePassword && (roles?.includes(RoleName.admin) ?? false);
}

function hasTutorReportSubmissionAccess(
  roles: readonly RoleName[] | null | undefined,
  mustChangePassword = false,
) {
  return !mustChangePassword && (roles?.includes(RoleName.tutor) ?? false);
}

export { hasAdminReportAccess, hasTutorReportSubmissionAccess };

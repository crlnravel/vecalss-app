import "server-only";

import { RoleName } from "@/generated/prisma/client";
import type { SessionContext } from "@/lib/auth/types";

type TryoutCapability =
  | "tryout.delivery.configure"
  | "tryout.delivery.open"
  | "tryout.results.manage"
  | "tryout.admission.manage"
  | "tryout.admission.register"
  | "tryout.attempt.execute";

class TryoutCapabilityError extends Error {}

function hasManagementRole(session: SessionContext) {
  return session.user.roles.includes(RoleName.tutor) || session.user.roles.includes(RoleName.admin);
}

function requireTryoutCapability(session: SessionContext, capability: TryoutCapability) {
  const allowed = capability === "tryout.admission.register" || capability === "tryout.attempt.execute"
    ? session.user.roles.includes(RoleName.student)
    : hasManagementRole(session);
  if (!allowed) throw new TryoutCapabilityError("Anda tidak memiliki izin Tryout untuk tindakan ini.");
}

export { requireTryoutCapability, TryoutCapabilityError };
export type { TryoutCapability };

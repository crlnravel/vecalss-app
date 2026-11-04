import "server-only";

import { SessionStatus, UserStatus, type Prisma } from "@/generated/prisma/client";
import { revokeOpenEnrollmentHandoffs } from "@/lib/admin/handoffs/service";

/**
 * The deactivation path, shared by enrollment's status change and fraud
 * blocks. The caller holds the user's row lock and has checked the account is
 * active. The status change is a credential-generation change
 * (`passwordUpdatedAt`) so a bcrypt verification that started before it cannot
 * issue a session afterwards; open handoffs and every active session end.
 */
async function applyAccountDeactivation(tx: Prisma.TransactionClient, userId: string, actorUserId: string | null) {
  const now = new Date();

  await tx.user.update({
    data: { passwordUpdatedAt: now, status: UserStatus.disabled },
    where: { id: userId },
  });
  await revokeOpenEnrollmentHandoffs(tx, userId, actorUserId);
  await tx.authSession.updateMany({
    data: { revokedAt: now, status: SessionStatus.revoked },
    where: { status: SessionStatus.active, userId },
  });
}

/** The other half of the same path: the caller holds the lock and has checked the account is disabled. */
async function applyAccountReactivation(tx: Prisma.TransactionClient, userId: string) {
  await tx.user.update({
    data: { passwordUpdatedAt: new Date(), status: UserStatus.active },
    where: { id: userId },
  });
}

export { applyAccountDeactivation, applyAccountReactivation };

import { RoleName, UserStatus, type Prisma } from "@/generated/prisma/client";

/**
 * Kapten content (Tryouts, reusable packages, assemblies, materi, Kuis and Bank
 * Soal) is shared: any active Kapten or admin may read and edit any of it.
 * Authorship stays on `createdByUserId`, and rows keep naming who last acted
 * (`updatedByUserId`, version creators, audit actors).
 *
 * Request handlers already enforce the role before calling the repositories.
 * These helpers repeat the rule at the data layer, so a caller that forgets the
 * check still cannot expose Kapten content to a student or a deactivated account.
 */
type UserLookup = Pick<Prisma.TransactionClient, "user">;

/** Matches no real row: `created_by_user_id` is a foreign key to a real user. */
const NO_ACCESS_USER_ID = "00000000-0000-0000-0000-000000000000";

async function isActiveKaptenOrAdmin(db: UserLookup, userId: string) {
  const actor = await db.user.findFirst({
    select: { id: true },
    where: {
      id: userId,
      previewPurpose: null,
      roleAssignments: {
        some: { revokedAt: null, role: { in: [RoleName.tutor, RoleName.admin] } },
      },
      softDeletedAt: null,
      status: UserStatus.active,
    },
  });

  return actor !== null;
}

/**
 * Spread into a `where` that used to say `createdByUserId: actorId`. Active
 * Kapten and admins get no creator filter; anyone else gets a filter that
 * matches nothing.
 */
async function kaptenAccessFilter(db: UserLookup, userId: string): Promise<{ createdByUserId?: string }> {
  return (await isActiveKaptenOrAdmin(db, userId)) ? {} : { createdByUserId: NO_ACCESS_USER_ID };
}

export { isActiveKaptenOrAdmin, kaptenAccessFilter, NO_ACCESS_USER_ID };

import { RoleName, UserStatus, type Prisma } from "@/generated/prisma/client";

import { kaptenOrAdminRoleSql } from "./mfa/data-layer";

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
type UserLookup = Pick<Prisma.TransactionClient, "$queryRaw" | "user">;

/** Matches no real row: `created_by_user_id` is a foreign key to a real user. */
const NO_ACCESS_USER_ID = "00000000-0000-0000-0000-000000000000";

async function isActiveKaptenOrAdmin(db: UserLookup, userId: string) {
  // Raw SQL so the admin's verified-session check runs on the database clock.
  const rows = await db.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM "role_assignments" AS ra
      JOIN "users" AS u ON u."id" = ra."user_id"
      WHERE ra."user_id" = ${userId}::uuid
        AND ra."revoked_at" IS NULL
        AND u."status" = 'active'
        AND u."soft_deleted_at" IS NULL
        AND u."preview_purpose" IS NULL
        AND ${kaptenOrAdminRoleSql()}
    ) AS allowed
  `;

  return rows[0]?.allowed === true;
}

/**
 * Active Kapten accounts, for notices that every Kapten who can edit shared
 * content should see. Admins can edit too but have no Kapten workspace to show
 * a notice in, so they are not listed unless they also hold the Kapten role.
 */
async function activeKaptenUserIds(db: UserLookup) {
  const kapten = await db.user.findMany({
    orderBy: { id: "asc" },
    select: { id: true },
    where: {
      previewPurpose: null,
      roleAssignments: { some: { revokedAt: null, role: RoleName.tutor } },
      softDeletedAt: null,
      status: UserStatus.active,
    },
  });

  return kapten.map((user) => user.id);
}

/**
 * Spread into a `where` that used to say `createdByUserId: actorId`. Active
 * Kapten and admins get no creator filter; anyone else gets a filter that
 * matches nothing.
 */
async function kaptenAccessFilter(db: UserLookup, userId: string): Promise<{ createdByUserId?: string }> {
  return (await isActiveKaptenOrAdmin(db, userId)) ? {} : { createdByUserId: NO_ACCESS_USER_ID };
}

export { activeKaptenUserIds, isActiveKaptenOrAdmin, kaptenAccessFilter, NO_ACCESS_USER_ID };

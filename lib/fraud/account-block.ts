import "server-only";

import type { Prisma } from "@/generated/prisma/client";

type Reader = Pick<Prisma.TransactionClient, "$queryRaw">;

/**
 * Whether an account block is in force for this user. It needs no secret (the
 * block is keyed by user id) and pulls in nothing else, so sign-in can use it.
 */
async function hasAccountBlockInForce(db: Reader, userId: string) {
  const [row] = await db.$queryRaw<Array<{ blocked: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM fraud_blocks
      WHERE block_type = 'account' AND lookup_token = ${userId.toLowerCase()} AND status = 'active'
        AND (expires_at IS NULL OR expires_at > clock_timestamp())
    ) AS blocked
  `;
  return row.blocked;
}

export { hasAccountBlockInForce };

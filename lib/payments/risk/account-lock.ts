import "server-only";

import type { Db } from "./policy";

/**
 * Takes the account's row lock (creating the row on first use). It is held to
 * the end of the transaction and serialises every limit check for the account,
 * and every block change that concerns it (lib/fraud). Idempotent within a
 * transaction.
 */
async function lockAccount(tx: Db, buyerId: string) {
  await tx.$executeRaw`
    INSERT INTO risk_account_tiers (user_id) VALUES (${buyerId}::uuid)
    ON CONFLICT (user_id) DO NOTHING
  `;
  await tx.$queryRaw`
    SELECT user_id FROM risk_account_tiers WHERE user_id = ${buyerId}::uuid FOR UPDATE
  `;
}

export { lockAccount };

import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

type FraudAudit = {
  action: string;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
  targetId: string | null;
  targetType: "fraud_appeal" | "fraud_block" | "fraud_case" | "system" | "user";
};

/**
 * Audit event for a fraud action, written in the same transaction as the change
 * and stamped with the database clock. Metadata holds ids, codes and counts;
 * the written reason lives in the history rows, not here, and no raw
 * identifier is ever written.
 */
async function writeFraudAudit(tx: Tx, audit: FraudAudit) {
  await tx.$executeRaw`
    INSERT INTO audit_logs (action, actor_user_id, target_type, target_id, metadata)
    VALUES (
      ${audit.action},
      ${audit.actorUserId ?? null}::uuid,
      ${audit.targetType},
      ${audit.targetId}::uuid,
      ${JSON.stringify(audit.metadata ?? {})}::jsonb
    )
  `;
}

export { writeFraudAudit };
export type { FraudAudit, Tx };

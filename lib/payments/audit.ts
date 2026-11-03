import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

type PaymentAudit = {
  action: string;
  actorUserId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
  targetId: string | null;
  targetType: "payment_order" | "payment_event";
};

/**
 * Domain audit event for a payment transition. Written with raw SQL so
 * `occurred_at` is the database's clock, in the same transaction as the change.
 */
async function writePaymentAudit(tx: Tx, audit: PaymentAudit) {
  await tx.$executeRaw`
    INSERT INTO audit_logs (action, actor_user_id, target_type, target_id, metadata, ip_address)
    VALUES (
      ${audit.action},
      ${audit.actorUserId ?? null}::uuid,
      ${audit.targetType},
      ${audit.targetId}::uuid,
      ${JSON.stringify(audit.metadata ?? {})}::jsonb,
      ${audit.ipAddress ?? null}::inet
    )
  `;
}

export { writePaymentAudit };
export type { PaymentAudit };

import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import { RefundError } from "./errors";

type Tx = Prisma.TransactionClient;

/** Who did a step. Provider confirmations and the daily job are not people. */
type Actor =
  | { kind: "admin" | "owner"; userId: string }
  | { kind: "provider" }
  | { kind: "system" };

type RefundCaseRow = {
  amountRupiah: number;
  approvedByUserId: string | null;
  buyerId: string;
  currency: string;
  executionAttempts: number;
  id: string;
  method: "manual_transfer" | "provider" | null;
  orderId: string;
  outcomeUnknown: boolean;
  preparedByUserId: string;
  providerPaymentId: string;
  providerRefundId: string | null;
  reasonCategory: "authority_order" | "change_of_mind" | "our_fault";
  reasonCode: string;
  reference: string;
  requestedAt: Date;
  revokeAccess: boolean;
  state: "approved" | "cancelled" | "completed" | "failed" | "prepared" | "processing" | "rejected";
  version: number;
};

const CASE_COLUMNS = `
  id, reference, order_id AS "orderId", buyer_id AS "buyerId", provider_payment_id AS "providerPaymentId",
  reason_category::text AS "reasonCategory", reason_code AS "reasonCode", amount_rupiah AS "amountRupiah",
  currency, state::text AS state, version, prepared_by_user_id AS "preparedByUserId",
  approved_by_user_id AS "approvedByUserId", requested_at AS "requestedAt", revoke_access AS "revokeAccess",
  method::text AS method, provider_refund_id AS "providerRefundId", execution_attempts AS "executionAttempts",
  outcome_unknown AS "outcomeUnknown"
`;

/**
 * Locks the order, then the case, in that order everywhere, so approvals,
 * executions, confirmations and disputes for one order run one after the other
 * and cannot deadlock. `expectedVersion` is the version the caller saw; a
 * different one means someone else changed the case first.
 */
async function lockRefundCase(tx: Tx, caseId: string, expectedVersion?: number): Promise<RefundCaseRow> {
  if (!/^[0-9a-f-]{36}$/iu.test(caseId)) throw new RefundError("not_found", "The refund case was not found.");

  const [ref = null] = await tx.$queryRaw<Array<{ orderId: string }>>`
    SELECT order_id AS "orderId" FROM refund_cases WHERE id = ${caseId}::uuid
  `;
  if (!ref) throw new RefundError("not_found", "The refund case was not found.");

  await tx.$executeRaw`SELECT 1 FROM payment_orders WHERE id = ${ref.orderId}::uuid FOR UPDATE`;
  const rows = await tx.$queryRawUnsafe<RefundCaseRow[]>(`SELECT ${CASE_COLUMNS} FROM refund_cases WHERE id = $1::uuid FOR UPDATE`, caseId);
  const row = rows[0];
  if (!row) throw new RefundError("not_found", "The refund case was not found.");
  if (expectedVersion !== undefined && row.version !== expectedVersion) {
    throw new RefundError("stale_version", "The refund case was changed by someone else.");
  }
  return row;
}

async function insertRefundEvent(
  tx: Tx,
  input: { actor: Actor; caseId: string; caseVersion: number; kind: string; metadata?: Record<string, unknown>; note?: string | null },
) {
  const [{ id }] = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO refund_case_events (case_id, case_version, kind, actor_user_id, actor_kind, note, metadata)
    VALUES (
      ${input.caseId}::uuid, ${input.caseVersion}, ${input.kind},
      ${"userId" in input.actor ? input.actor.userId : null}::uuid, ${input.actor.kind},
      ${input.note ?? null}, ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    RETURNING id
  `;
  return id;
}

async function databaseNow(tx: Pick<Tx, "$queryRaw">) {
  const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  return now;
}

export { CASE_COLUMNS, databaseNow, insertRefundEvent, lockRefundCase };
export type { Actor, RefundCaseRow, Tx };

import "server-only";

import type { Prisma } from "@/generated/prisma/client";

type Db = Pick<Prisma.TransactionClient, "$queryRaw">;

type RefundEventRecord = {
  actorKind: string;
  actorEmail: string | null;
  at: Date;
  kind: string;
  metadata: Record<string, unknown>;
  note: string | null;
  version: number;
};

type RefundRecord = {
  accessEffect: string | null;
  amountRupiah: number;
  approvalReason: string | null;
  approvedAt: Date | null;
  approvedByEmail: string | null;
  closedAt: Date | null;
  closureReason: string | null;
  completedAt: Date | null;
  confirmationSource: string | null;
  decisionDueAt: Date;
  destinationHolder: string | null;
  destinationMasked: string | null;
  eligibilityApproved: Record<string, unknown> | null;
  eligibilityPrepared: Record<string, unknown>;
  events: RefundEventRecord[];
  id: string;
  method: string | null;
  outcomeUnknown: boolean;
  payoutDueAt: Date | null;
  preparedAt: Date;
  preparedByEmail: string;
  proofNote: string | null;
  providerPaymentId: string;
  providerRefundId: string | null;
  reasonCategory: string;
  reasonCode: string;
  reference: string;
  requestChannel: string;
  requestedAt: Date;
  requestNote: string;
  revokeAccess: boolean;
  selfApproved: boolean | null;
  state: string;
  transferReference: string | null;
  version: number;
};

type DisputeRecord = {
  accessEffect: string | null;
  accessPaused: boolean;
  amountRupiah: number;
  evidenceHold: boolean;
  events: RefundEventRecord[];
  id: string;
  noticeReceivedAt: Date;
  providerDisputeId: string;
  providerPaymentId: string;
  reasonText: string;
  refundInFlight: boolean;
  resolutionNote: string | null;
  resolutionSource: string | null;
  resolvedAt: Date | null;
  responseDueAt: Date | null;
  source: string;
  state: string;
  version: number;
};

/** Every refund case of an order, with who did what and the full history, oldest first. */
async function listRefundRecords(db: Db, orderId: string): Promise<RefundRecord[]> {
  const cases = await db.$queryRaw<Array<Omit<RefundRecord, "events">>>`
    SELECT c.id, c.reference, c.provider_payment_id AS "providerPaymentId", c.reason_category::text AS "reasonCategory",
           c.reason_code AS "reasonCode", c.request_note AS "requestNote", c.request_channel AS "requestChannel",
           c.requested_at AS "requestedAt", c.amount_rupiah AS "amountRupiah", c.state::text AS state, c.version,
           pu.email AS "preparedByEmail", c.prepared_at AS "preparedAt", c.decision_due_at AS "decisionDueAt",
           c.eligibility_prepared AS "eligibilityPrepared", au.email AS "approvedByEmail", c.approved_at AS "approvedAt",
           c.approval_reason AS "approvalReason", c.self_approved AS "selfApproved",
           c.eligibility_approved AS "eligibilityApproved", c.payout_due_at AS "payoutDueAt",
           c.revoke_access AS "revokeAccess", c.closed_at AS "closedAt", c.closure_reason AS "closureReason",
           c.method::text AS method, c.provider_refund_id AS "providerRefundId", c.outcome_unknown AS "outcomeUnknown",
           c.destination_masked AS "destinationMasked", c.destination_holder AS "destinationHolder",
           c.transfer_reference AS "transferReference", c.proof_note AS "proofNote", c.completed_at AS "completedAt",
           c.confirmation_source AS "confirmationSource", c.access_effect AS "accessEffect"
    FROM refund_cases c
    JOIN users pu ON pu.id = c.prepared_by_user_id
    LEFT JOIN users au ON au.id = c.approved_by_user_id
    WHERE c.order_id = ${orderId}::uuid
    ORDER BY c.prepared_at, c.id
  `;

  const records: RefundRecord[] = [];
  for (const item of cases) {
    const events = await db.$queryRaw<RefundEventRecord[]>`
      SELECT e.kind, e.case_version AS version, e.actor_kind AS "actorKind", u.email AS "actorEmail",
             e.note, e.metadata, e.created_at AS at
      FROM refund_case_events e LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE e.case_id = ${item.id}::uuid ORDER BY e.created_at, e.id
    `;
    records.push({ ...item, events });
  }
  return records;
}

/** Every dispute of an order, with its history, oldest first. */
async function listDisputeRecords(db: Db, orderId: string): Promise<DisputeRecord[]> {
  const disputes = await db.$queryRaw<Array<Omit<DisputeRecord, "events">>>`
    SELECT d.id, d.provider_payment_id AS "providerPaymentId", d.provider_dispute_id AS "providerDisputeId",
           d.source, d.reason_text AS "reasonText", d.amount_rupiah AS "amountRupiah",
           d.notice_received_at AS "noticeReceivedAt", d.response_due_at AS "responseDueAt", d.state::text AS state,
           d.version, d.evidence_hold AS "evidenceHold", d.access_paused AS "accessPaused",
           d.refund_in_flight AS "refundInFlight", d.resolved_at AS "resolvedAt",
           d.resolution_source AS "resolutionSource", d.resolution_note AS "resolutionNote", d.access_effect AS "accessEffect"
    FROM payment_disputes d
    WHERE d.order_id = ${orderId}::uuid
    ORDER BY d.created_at, d.id
  `;

  const records: DisputeRecord[] = [];
  for (const item of disputes) {
    const events = await db.$queryRaw<RefundEventRecord[]>`
      SELECT e.kind, e.dispute_version AS version, e.actor_kind AS "actorKind", u.email AS "actorEmail",
             e.note, e.metadata, e.created_at AS at
      FROM payment_dispute_events e LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE e.dispute_id = ${item.id}::uuid ORDER BY e.created_at, e.id
    `;
    records.push({ ...item, events });
  }
  return records;
}

type RecentRefundRow = {
  amountRupiah: number;
  buyerEmail: string;
  decisionDueAt: Date;
  id: string;
  orderId: string;
  payoutDueAt: Date | null;
  preparedAt: Date;
  reasonCode: string;
  state: string;
};

/** Open cases first, then the newest; for the small refund list. */
async function listRecentRefunds(db: Db, limit = 50): Promise<RecentRefundRow[]> {
  return db.$queryRaw<RecentRefundRow[]>`
    SELECT c.id, c.order_id AS "orderId", c.amount_rupiah AS "amountRupiah", c.state::text AS state,
           c.reason_code AS "reasonCode", c.prepared_at AS "preparedAt", c.decision_due_at AS "decisionDueAt",
           c.payout_due_at AS "payoutDueAt", u.email AS "buyerEmail"
    FROM refund_cases c JOIN users u ON u.id = c.buyer_id
    ORDER BY (c.state IN ('prepared', 'approved', 'processing')) DESC, c.prepared_at DESC
    LIMIT ${Math.min(limit, 100)}
  `;
}

export { listDisputeRecords, listRecentRefunds, listRefundRecords };
export type { DisputeRecord, RecentRefundRow, RefundEventRecord, RefundRecord };

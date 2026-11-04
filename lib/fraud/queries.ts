import "server-only";

import { prisma } from "@/lib/prisma";

import type { FraudBlockType } from "./constants";

/**
 * Reads for the admin pages. The lists never include a raw identifier: a block
 * shows its masked hint, a case shows ids and counts. The case detail adds the
 * linked order's buyer address, which only an admin with a verified second
 * factor reaches (the pages are gated; this module is only imported by them).
 */

type CaseRow = {
  hitCount: number;
  id: string;
  lastSeenAt: Date;
  openedAt: Date;
  ownerName: string | null;
  severity: "critical" | "high" | "low" | "medium";
  signal: string;
  state: "acknowledged" | "closed" | "escalated" | "open";
  version: number;
};

const CASE_STATES = ["open", "acknowledged", "escalated", "closed"] as const;
type CaseStateFilter = (typeof CASE_STATES)[number] | "active";

async function listCases(filter: CaseStateFilter, limit = 100): Promise<CaseRow[]> {
  const where = filter === "active" ? "c.state <> 'closed'" : `c.state = '${filter}'`;
  // `where` is built only from the closed set above, never from input.
  return prisma.$queryRawUnsafe<CaseRow[]>(`
    SELECT c.id, c.signal, c.severity::text AS severity, c.state::text AS state, c.version,
           c.hit_count AS "hitCount", c.opened_at AS "openedAt", c.last_seen_at AS "lastSeenAt",
           o.full_name AS "ownerName"
    FROM fraud_cases c LEFT JOIN users o ON o.id = c.owner_user_id
    WHERE ${where}
    ORDER BY CASE c.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, c.opened_at DESC
    LIMIT ${Math.min(limit, 200)}
  `);
}

async function countCasesByState() {
  const rows = await prisma.$queryRaw<Array<{ count: number; state: string }>>`
    SELECT state::text AS state, count(*)::int AS count FROM fraud_cases GROUP BY 1
  `;
  return Object.fromEntries(rows.map((row) => [row.state, row.count])) as Record<string, number>;
}

type CaseDetail = CaseRow & {
  closureReason: string | null;
  evidence: Record<string, unknown>;
  order: { amountRupiah: number; buyerIp: string | null; id: string; packageCode: string; status: string } | null;
  policyVersion: number | null;
  ruleVersion: number;
  subjectType: string;
  userEmail: string | null;
  userId: string | null;
};

async function getCaseDetail(caseId: string) {
  if (!/^[0-9a-f-]{36}$/iu.test(caseId)) return null;

  const [row = null] = await prisma.$queryRaw<Array<Omit<CaseDetail, "order"> & {
    orderAmount: number | null; orderBuyerIp: string | null; orderId: string | null; orderPackage: string | null; orderStatus: string | null;
  }>>`
    SELECT c.id, c.signal, c.severity::text AS severity, c.state::text AS state, c.version,
           c.hit_count AS "hitCount", c.opened_at AS "openedAt", c.last_seen_at AS "lastSeenAt",
           own.full_name AS "ownerName", c.closure_reason AS "closureReason", c.evidence,
           c.policy_version AS "policyVersion", c.rule_version AS "ruleVersion", c.subject_type AS "subjectType",
           u.email AS "userEmail", c.user_id AS "userId",
           o.id AS "orderId", o.amount_rupiah AS "orderAmount", host(o.buyer_ip) AS "orderBuyerIp",
           o.package_code AS "orderPackage", o.status::text AS "orderStatus"
    FROM fraud_cases c
    LEFT JOIN users own ON own.id = c.owner_user_id
    LEFT JOIN users u ON u.id = c.user_id
    LEFT JOIN payment_orders o ON o.id = c.order_id
    WHERE c.id = ${caseId}::uuid
  `;
  if (!row) return null;

  const events = await prisma.$queryRaw<Array<{
    actorKind: string; actorName: string | null; createdAt: Date; id: string; kind: string; note: string | null;
  }>>`
    SELECT e.id, e.kind, e.actor_kind AS "actorKind", a.full_name AS "actorName", e.note, e.created_at AS "createdAt"
    FROM fraud_case_events e LEFT JOIN users a ON a.id = e.actor_user_id
    WHERE e.case_id = ${caseId}::uuid ORDER BY e.created_at, e.case_version
  `;
  const blocks = await prisma.$queryRaw<Array<{ blockType: string; hint: string; id: string; status: string }>>`
    SELECT b.id, b.block_type::text AS "blockType", b.hint, b.status::text AS status
    FROM fraud_case_blocks cb JOIN fraud_blocks b ON b.id = cb.block_id WHERE cb.case_id = ${caseId}::uuid
  `;

  const { orderAmount, orderBuyerIp, orderId, orderPackage, orderStatus, ...rest } = row;
  const detail: CaseDetail = {
    ...rest,
    order: orderId
      ? { amountRupiah: orderAmount ?? 0, buyerIp: orderBuyerIp, id: orderId, packageCode: orderPackage ?? "", status: orderStatus ?? "" }
      : null,
  };
  return { blocks, detail, events };
}

type BlockRow = {
  blockType: FraudBlockType;
  createdAt: Date;
  expiresAt: Date | null;
  hint: string;
  id: string;
  inForce: boolean;
  reasonCode: string;
  reviewDueAt: Date | null;
  source: "automatic" | "manual";
  status: "active" | "expired" | "lifted";
  version: number;
};

const BLOCK_SELECT = `
  SELECT b.id, b.block_type::text AS "blockType", b.hint, b.source::text AS source, b.status::text AS status,
         b.reason_code AS "reasonCode", b.version, b.created_at AS "createdAt", b.expires_at AS "expiresAt",
         b.review_due_at AS "reviewDueAt",
         (b.status = 'active' AND (b.expires_at IS NULL OR b.expires_at > clock_timestamp())) AS "inForce"
  FROM fraud_blocks b
`;

async function listBlocks(scope: "all" | "in_force", limit = 100): Promise<BlockRow[]> {
  return prisma.$queryRawUnsafe<BlockRow[]>(`
    ${BLOCK_SELECT}
    ${scope === "in_force" ? "WHERE b.status = 'active' AND (b.expires_at IS NULL OR b.expires_at > clock_timestamp())" : ""}
    ORDER BY b.created_at DESC LIMIT ${Math.min(limit, 200)}
  `);
}

type BlockDetail = BlockRow & {
  appeal: { channel: string; decisionReason: string | null; dueAt: Date; id: string; overdue: boolean; receivedAt: Date; reopenCount: number; state: string; summary: string; version: number } | null;
  caseId: string | null;
  history: Array<{ actorName: string | null; createdAt: Date; id: string; kind: string; reason: string }>;
  reasonNote: string;
};

async function getBlockDetail(blockId: string): Promise<BlockDetail | null> {
  if (!/^[0-9a-f-]{36}$/iu.test(blockId)) return null;

  const [row = null] = await prisma.$queryRaw<Array<BlockRow & { reasonNote: string }>>`
    SELECT b.id, b.block_type::text AS "blockType", b.hint, b.source::text AS source, b.status::text AS status,
           b.reason_code AS "reasonCode", b.reason_note AS "reasonNote", b.version, b.created_at AS "createdAt",
           b.expires_at AS "expiresAt", b.review_due_at AS "reviewDueAt",
           (b.status = 'active' AND (b.expires_at IS NULL OR b.expires_at > clock_timestamp())) AS "inForce"
    FROM fraud_blocks b WHERE b.id = ${blockId}::uuid
  `;
  if (!row) return null;

  const history = await prisma.$queryRaw<BlockDetail["history"]>`
    SELECT e.id, e.kind, e.reason, e.created_at AS "createdAt", a.full_name AS "actorName"
    FROM fraud_block_events e LEFT JOIN users a ON a.id = e.actor_user_id
    WHERE e.block_id = ${blockId}::uuid ORDER BY e.block_version
  `;
  const [appeal = null] = await prisma.$queryRaw<NonNullable<BlockDetail["appeal"]>[]>`
    SELECT id, state::text AS state, channel, summary, received_at AS "receivedAt", due_at AS "dueAt",
           decision_reason AS "decisionReason", reopen_count AS "reopenCount", version,
           (state = 'pending' AND due_at < now()) AS overdue
    FROM fraud_appeals WHERE block_id = ${blockId}::uuid
  `;
  const [linked = null] = await prisma.$queryRaw<Array<{ caseId: string }>>`
    SELECT case_id AS "caseId" FROM fraud_case_blocks WHERE block_id = ${blockId}::uuid ORDER BY linked_at LIMIT 1
  `;

  return { ...row, appeal, caseId: linked?.caseId ?? null, history };
}

export { CASE_STATES, countCasesByState, getBlockDetail, getCaseDetail, listBlocks, listCases };
export type { BlockDetail, BlockRow, CaseDetail, CaseRow, CaseStateFilter };

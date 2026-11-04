import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * The monthly management report. Aggregates only: counts, rupiah totals and
 * average times, grouped by type, signal, severity and outcome. It never reads
 * or returns an IP address, email, phone number, device value or account id, so
 * the page can be shown or copied around without circulating customer data.
 * Months are Asia/Jakarta calendar months, cut on database time.
 */

type MonthlyReport = {
  appeals: { denied: number; granted: number; overdue: number; pending: number; received: number };
  blocks: {
    activeNow: Record<string, number>;
    createdByTypeAndSource: Array<{ count: number; source: string; type: string }>;
    expired: number;
    lifted: number;
  };
  cases: {
    averageHoursToAcknowledge: number | null;
    averageHoursToClose: number | null;
    closed: number;
    openedBySeverity: Record<string, number>;
    openedBySignal: Array<{ count: number; signal: string }>;
    unresolvedNow: number;
  };
  month: string;
  orders: {
    accepted: { count: number; rupiah: number };
    expired: number;
    failed: number;
    inReview: { count: number; rupiah: number };
    started: { count: number; rupiah: number };
  };
  refusedCheckouts: Array<{ count: number; reason: string }>;
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/u;

function isReportMonth(value: string): boolean {
  return MONTH_PATTERN.test(value);
}

/** The current Asia/Jakarta month on database time, as YYYY-MM. */
async function currentReportMonth() {
  const [{ month }] = await prisma.$queryRaw<Array<{ month: string }>>`SELECT to_char(risk_jakarta_day(now()), 'YYYY-MM') AS month`;
  return month;
}

async function buildMonthlyReport(month: string): Promise<MonthlyReport> {
  if (!isReportMonth(month)) throw new Error("The report month must look like 2026-11.");

  // [start, end) of the Jakarta month, as instants.
  const [{ start, end }] = await prisma.$queryRaw<Array<{ end: Date; start: Date }>>`
    SELECT (${`${month}-01`}::date::timestamp AT TIME ZONE 'Asia/Jakarta') AS start,
           ((${`${month}-01`}::date + interval '1 month')::timestamp AT TIME ZONE 'Asia/Jakarta') AS end
  `;

  const [orders] = await prisma.$queryRaw<Array<{
    acceptedCount: number; acceptedRupiah: number; expired: number; failed: number;
    reviewCount: number; reviewRupiah: number; startedCount: number; startedRupiah: number;
  }>>`
    SELECT count(*)::int AS "startedCount", COALESCE(sum(amount_rupiah), 0)::int AS "startedRupiah",
           count(*) FILTER (WHERE status = 'paid')::int AS "acceptedCount",
           COALESCE(sum(amount_rupiah) FILTER (WHERE status = 'paid'), 0)::int AS "acceptedRupiah",
           count(*) FILTER (WHERE status = 'failed')::int AS failed,
           count(*) FILTER (WHERE status = 'expired')::int AS expired,
           count(*) FILTER (WHERE status = 'review')::int AS "reviewCount",
           COALESCE(sum(amount_rupiah) FILTER (WHERE status = 'review'), 0)::int AS "reviewRupiah"
    FROM payment_orders WHERE created_at >= ${start} AND created_at < ${end}
  `;

  const refusedCheckouts = await prisma.$queryRaw<Array<{ count: number; reason: string }>>`
    SELECT COALESCE(metadata->>'reason', 'unknown') AS reason, count(*)::int AS count
    FROM audit_logs
    WHERE action = 'payment.checkout.refused' AND occurred_at >= ${start} AND occurred_at < ${end}
    GROUP BY 1 ORDER BY 2 DESC, 1
  `;

  const openedBySignal = await prisma.$queryRaw<Array<{ count: number; signal: string }>>`
    SELECT signal, count(*)::int AS count FROM fraud_cases
    WHERE opened_at >= ${start} AND opened_at < ${end} GROUP BY signal ORDER BY 2 DESC, 1
  `;
  const openedBySeverity = await prisma.$queryRaw<Array<{ count: number; severity: string }>>`
    SELECT severity::text AS severity, count(*)::int AS count FROM fraud_cases
    WHERE opened_at >= ${start} AND opened_at < ${end} GROUP BY 1
  `;
  const [caseStats] = await prisma.$queryRaw<Array<{
    averageHoursToAcknowledge: number | null; averageHoursToClose: number | null; closed: number; unresolved: number;
  }>>`
    SELECT (SELECT count(*) FROM fraud_cases WHERE closed_at >= ${start} AND closed_at < ${end})::int AS closed,
           (SELECT count(*) FROM fraud_cases WHERE state <> 'closed')::int AS unresolved,
           (SELECT round((avg(extract(epoch FROM acknowledged_at - opened_at)) / 3600)::numeric, 1)::float8
              FROM fraud_cases WHERE opened_at >= ${start} AND opened_at < ${end} AND acknowledged_at IS NOT NULL) AS "averageHoursToAcknowledge",
           (SELECT round((avg(extract(epoch FROM closed_at - opened_at)) / 3600)::numeric, 1)::float8
              FROM fraud_cases WHERE opened_at >= ${start} AND opened_at < ${end} AND closed_at IS NOT NULL) AS "averageHoursToClose"
  `;

  const blocksCreated = await prisma.$queryRaw<Array<{ count: number; source: string; type: string }>>`
    SELECT block_type::text AS type, source::text AS source, count(*)::int AS count FROM fraud_blocks
    WHERE created_at >= ${start} AND created_at < ${end} GROUP BY 1, 2 ORDER BY 1, 2
  `;
  const [blockEnds] = await prisma.$queryRaw<Array<{ expired: number; lifted: number }>>`
    SELECT count(*) FILTER (WHERE status = 'lifted')::int AS lifted, count(*) FILTER (WHERE status = 'expired')::int AS expired
    FROM fraud_blocks WHERE ended_at >= ${start} AND ended_at < ${end}
  `;
  const activeNow = await prisma.$queryRaw<Array<{ count: number; type: string }>>`
    SELECT block_type::text AS type, count(*)::int AS count FROM fraud_blocks
    WHERE status = 'active' AND (expires_at IS NULL OR expires_at > clock_timestamp()) GROUP BY 1
  `;

  const [appeals] = await prisma.$queryRaw<Array<{ denied: number; granted: number; overdue: number; pending: number; received: number }>>`
    SELECT count(*) FILTER (WHERE received_at >= ${start} AND received_at < ${end})::int AS received,
           count(*) FILTER (WHERE state = 'granted' AND decided_at >= ${start} AND decided_at < ${end})::int AS granted,
           count(*) FILTER (WHERE state = 'denied' AND decided_at >= ${start} AND decided_at < ${end})::int AS denied,
           count(*) FILTER (WHERE state = 'pending')::int AS pending,
           count(*) FILTER (WHERE state = 'pending' AND due_at < now())::int AS overdue
    FROM fraud_appeals
  `;

  return {
    appeals,
    blocks: {
      activeNow: Object.fromEntries(activeNow.map((row) => [row.type, row.count])),
      createdByTypeAndSource: blocksCreated,
      expired: blockEnds.expired,
      lifted: blockEnds.lifted,
    },
    cases: {
      averageHoursToAcknowledge: caseStats.averageHoursToAcknowledge,
      averageHoursToClose: caseStats.averageHoursToClose,
      closed: caseStats.closed,
      openedBySeverity: Object.fromEntries(openedBySeverity.map((row) => [row.severity, row.count])),
      openedBySignal,
      unresolvedNow: caseStats.unresolved,
    },
    month,
    orders: {
      accepted: { count: orders.acceptedCount, rupiah: orders.acceptedRupiah },
      expired: orders.expired,
      failed: orders.failed,
      inReview: { count: orders.reviewCount, rupiah: orders.reviewRupiah },
      started: { count: orders.startedCount, rupiah: orders.startedRupiah },
    },
    refusedCheckouts,
  };
}

export { buildMonthlyReport, currentReportMonth, isReportMonth };
export type { MonthlyReport };

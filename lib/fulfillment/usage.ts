import "server-only";

import { prisma } from "@/lib/prisma";
import { serverLogger } from "@/lib/server-logger";

/**
 * Records that a student really used a paid surface, for dispute evidence.
 *
 * It runs where a student enters a paid surface, whether or not the paywall
 * switch is on (a buyer who paid and then used the product is dispute evidence
 * either way), and writes at most one row per grant per Asia/Jakarta day: a
 * single `INSERT … ON CONFLICT DO NOTHING` whose unique key answers "already
 * recorded today" without a read.
 *
 * It records only while the student's current access is active, judged on the
 * `billing_accounts` row exactly as `hasPaidAccess` does (so access an admin
 * paused or revoked after the payment records nothing), and the grant is the
 * student's newest payment-sourced access event that still covers this moment.
 * Access an admin granted (no payment, nothing to dispute) records nothing.
 * Nothing else writes this table; usage is never made up.
 *
 * Evidence must not cost a student a page, so a failure is logged and swallowed.
 */
async function recordPaidUse(studentId: string) {
  try {
    await prisma.$executeRaw`
      INSERT INTO fulfillment_usage_events (grant_event_id, order_id, student_id, jakarta_day)
      SELECT e.id, r.order_id, e.student_id, risk_jakarta_day(now())
      FROM billing_access_events e
      JOIN payment_receipts r ON r.grant_event_id = e.id
      JOIN billing_accounts a ON a.student_id = e.student_id
      WHERE e.student_id = ${studentId}::uuid
        AND a.status = 'active'
        AND a.access_starts_at <= now()
        AND a.access_expires_at > now()
        AND e.source = 'payment'
        AND e.starts_at <= now()
        AND e.ends_at > now()
        AND NOT EXISTS (
          SELECT 1 FROM billing_access_events later
          WHERE later.student_id = e.student_id AND later.source = 'payment' AND later.occurred_at > e.occurred_at
        )
      ON CONFLICT (grant_event_id, jakarta_day) DO NOTHING
    `;
  } catch (error) {
    serverLogger.error("fulfillment.usage.record_failed", error instanceof Error ? error : new Error("usage record failed"), {
      area: "fulfillment",
    });
  }
}

export { recordPaidUse };

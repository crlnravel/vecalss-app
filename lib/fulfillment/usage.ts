import "server-only";

import { prisma } from "@/lib/prisma";
import { serverLogger } from "@/lib/server-logger";

type Db = Pick<typeof prisma, "$executeRaw">;
type Logger = Pick<typeof serverLogger, "error">;

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
 * A failed event write records a durable usage evidence gap for the student,
 * once per Jakarta day; eligibility treats a gap after the payment as use. If
 * neither write succeeds, return false so the caller does not serve the paid
 * surface without evidence. Both failures are logged.
 */
async function recordPaidUse(studentId: string, db: Db = prisma, logger: Logger = serverLogger) {
  try {
    await db.$executeRaw`
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
    return true;
  } catch (error) {
    logger.error("fulfillment.usage.record_failed", error instanceof Error ? error : new Error("usage record failed"), {
      area: "fulfillment",
    });
    try {
      await db.$executeRaw`
        INSERT INTO fulfillment_usage_gaps (student_id) VALUES (${studentId}::uuid)
        ON CONFLICT (student_id, jakarta_day) DO NOTHING
      `;
      return true;
    } catch (gapError) {
      logger.error("fulfillment.usage.gap_failed", gapError instanceof Error ? gapError : new Error("usage gap record failed"), {
        area: "fulfillment",
      });
      return false;
    }
  }
}

export { recordPaidUse };

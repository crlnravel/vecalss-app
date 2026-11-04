import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import { CHANGE_OF_MIND_WINDOW_DAYS, REFUND_REASONS, type RefundReasonCategory, type RefundReasonCode } from "./constants";

type Db = Pick<Prisma.TransactionClient, "$queryRaw">;

type EligibilityRule =
  | "authority_order"
  | "change_of_mind_ok"
  | "change_of_mind_used"
  | "change_of_mind_window_and_used"
  | "change_of_mind_window_passed"
  | "our_fault";

/** The check the system makes, kept with the case so the owner approves against what the system saw. */
type Eligibility = {
  asOf: string;
  category: RefundReasonCategory;
  eligible: boolean;
  evaluatedAt: string;
  paidAt: string | null;
  reasonCode: RefundReasonCode;
  rule: EligibilityRule;
  usageRows: number;
  /** Days a paid use could not be recorded (a failed write), which count as use. */
  usageGaps: number;
  windowDays: number;
  windowEndsAt: string | null;
  withinWindow: boolean;
};

type EvaluateInput = {
  /**
   * When the buyer asked. A change-of-mind request must arrive within 3 days of
   * payment, however long the decision takes, so the window is judged at this
   * moment. Omitted, it is the database's current time. Usage is never judged
   * by that date: every usage row the order has, as of now, counts.
   */
  asOf?: Date | null;
  orderId: string;
  reasonCode: RefundReasonCode;
};

/**
 * The eligibility of one refund, computed by the system from the order and the
 * MS-08 usage evidence, on database time (decision "Refund eligibility"):
 *
 * - our fault (double charge, wrong amount, paid but access never delivered, or
 *   a service we could not provide): always eligible;
 * - authority order (a regulator, acquirer or court ordered it): always
 *   eligible, whatever the age or use of the order;
 * - change of mind: eligible only when requested within 3 days of payment AND no
 *   `fulfillment_usage_events` row exists for the order AND no usage evidence gap
 *   (a failed usage write, `fulfillment_usage_gaps`) for the buyer since the payment.
 *
 * The window is inclusive: a request exactly 3 days after payment still counts.
 * An order held in review has no `paid_at`; the time its payment arrived (the
 * first succeeded event) stands in for it.
 */
async function evaluateEligibility(db: Db, input: EvaluateInput): Promise<Eligibility> {
  const category = REFUND_REASONS[input.reasonCode].category;

  const [row = null] = await db.$queryRaw<Array<{
    asOf: Date;
    evaluatedAt: Date;
    paidAt: Date | null;
    usageGaps: number;
    usageRows: number;
    windowEndsAt: Date | null;
    withinWindow: boolean | null;
  }>>`
    WITH base AS (
      SELECT
        COALESCE(o.paid_at, (
          SELECT min(e.received_at) FROM payment_events e
          WHERE e.order_id = o.id AND e.type::text = 'succeeded' AND e.outcome::text IN ('accepted', 'review')
        )) AS paid_at,
        COALESCE(${input.asOf ?? null}::timestamptz, clock_timestamp()) AS as_of,
        o.id AS order_id,
        o.buyer_id AS buyer_id
      FROM payment_orders o WHERE o.id = ${input.orderId}::uuid
    )
    SELECT base.paid_at AS "paidAt",
           base.as_of AS "asOf",
           clock_timestamp() AS "evaluatedAt",
           (base.paid_at + make_interval(days => ${CHANGE_OF_MIND_WINDOW_DAYS}::int)) AS "windowEndsAt",
           (base.as_of <= base.paid_at + make_interval(days => ${CHANGE_OF_MIND_WINDOW_DAYS}::int)) AS "withinWindow",
           (SELECT count(*)::int FROM fulfillment_usage_events u WHERE u.order_id = base.order_id) AS "usageRows",
           (SELECT count(*)::int FROM fulfillment_usage_gaps g WHERE g.student_id = base.buyer_id AND g.occurred_at >= base.paid_at) AS "usageGaps"
    FROM base
  `;
  if (!row) throw new Error("The order was not found.");

  const withinWindow = row.withinWindow === true;
  let rule: EligibilityRule;
  let eligible: boolean;
  if (category === "authority_order") {
    rule = "authority_order";
    eligible = true;
  } else if (category === "our_fault") {
    rule = "our_fault";
    eligible = true;
  } else if (withinWindow && row.usageRows === 0 && row.usageGaps === 0) {
    rule = "change_of_mind_ok";
    eligible = true;
  } else {
    eligible = false;
    const used = row.usageRows > 0 || row.usageGaps > 0;
    rule = !withinWindow && used
      ? "change_of_mind_window_and_used"
      : !withinWindow ? "change_of_mind_window_passed" : "change_of_mind_used";
  }

  return {
    asOf: row.asOf.toISOString(),
    category,
    eligible,
    evaluatedAt: row.evaluatedAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    reasonCode: input.reasonCode,
    rule,
    usageGaps: row.usageGaps,
    usageRows: row.usageRows,
    windowDays: CHANGE_OF_MIND_WINDOW_DAYS,
    windowEndsAt: row.windowEndsAt?.toISOString() ?? null,
    withinWindow,
  };
}

const RULE_TEXT: Record<EligibilityRule, string> = {
  authority_order: "Memenuhi syarat: pengembalian karena perintah otoritas selalu bisa dilakukan, tanpa batas 3 hari dan tanpa melihat pemakaian fitur.",
  change_of_mind_ok: "Memenuhi syarat: permintaan masuk dalam 3 hari sejak pembayaran dan belum ada fitur berbayar yang dipakai.",
  change_of_mind_used: "Tidak memenuhi syarat: sudah ada fitur berbayar yang dipakai.",
  change_of_mind_window_and_used: "Tidak memenuhi syarat: permintaan masuk lebih dari 3 hari setelah pembayaran dan fitur berbayar sudah dipakai.",
  change_of_mind_window_passed: "Tidak memenuhi syarat: permintaan masuk lebih dari 3 hari setelah pembayaran.",
  our_fault: "Memenuhi syarat: kesalahan di pihak kami selalu dikembalikan penuh.",
};

export { evaluateEligibility, RULE_TEXT };
export type { Eligibility, EligibilityRule };

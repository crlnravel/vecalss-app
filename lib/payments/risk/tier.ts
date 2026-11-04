import "server-only";

import type { Db, RiskPolicy } from "./policy";

type RiskTierName = "unverified" | "verified";

/** The facts a tier was decided from, kept with the account and each reservation. */
type TierBasis = {
  accountAgeDays: number;
  minAccountAgeDays: number;
  /** The paid order that makes the buyer verified, or null when there is none. */
  qualifyingOrderId: string | null;
  policyVersion: number;
};

type TierResult = {
  basis: TierBasis;
  changed: boolean;
  tier: RiskTierName;
};

/**
 * The buyer's earliest paid order that stands. A buyer is verified only with
 * one of these AND an account old enough.
 *
 * An order stands only while it has no refund and no dispute (decision G2:
 * "no refund or dispute"). A refund counts from its approval, since that is
 * when the money is committed to go back; a case that was only prepared,
 * rejected, cancelled or failed does not count. A dispute counts in every
 * state, won ones included: it happened. This is the one place that decides
 * who is verified (MS-09).
 */
async function findStandingPaidOrder(db: Db, userId: string) {
  const [order = null] = await db.$queryRaw<Array<{ id: string }>>`
    SELECT o.id
    FROM payment_orders o
    WHERE o.buyer_id = ${userId}::uuid
      AND o.status = 'paid'
      AND NOT EXISTS (
        SELECT 1 FROM refund_cases c
        WHERE c.order_id = o.id AND c.state::text IN ('approved', 'processing', 'completed')
      )
      AND NOT EXISTS (SELECT 1 FROM payment_disputes d WHERE d.order_id = o.id)
    ORDER BY o.paid_at, o.id
    LIMIT 1
  `;
  return order?.id ?? null;
}

/**
 * Decides the account's tier from database time and its paid orders, and
 * records tier and basis on the account row. The caller holds the row lock
 * (see reserveCheckout), so two checkouts never record different answers.
 * Registered, email-confirmed, documentary-verified and 3DS-authenticated are
 * separate facts and none of them is used here: registration alone never makes
 * an account verified.
 */
async function evaluateTier(db: Db, userId: string, policy: RiskPolicy): Promise<TierResult> {
  const [{ ageDays }] = await db.$queryRaw<Array<{ ageDays: number }>>`
    SELECT floor(extract(epoch FROM (clock_timestamp() - created_at)) / 86400)::int AS "ageDays"
    FROM users WHERE id = ${userId}::uuid
  `;
  const qualifyingOrderId = await findStandingPaidOrder(db, userId);
  const verified = ageDays >= policy.verifiedMinAccountAgeDays && qualifyingOrderId !== null;

  const basis: TierBasis = {
    accountAgeDays: ageDays,
    minAccountAgeDays: policy.verifiedMinAccountAgeDays,
    policyVersion: policy.version,
    qualifyingOrderId,
  };
  const tier: RiskTierName = verified ? "verified" : "unverified";

  const [previous] = await db.$queryRaw<Array<{ tier: RiskTierName }>>`
    SELECT tier::text AS tier FROM risk_account_tiers WHERE user_id = ${userId}::uuid
  `;
  await db.$executeRaw`
    UPDATE risk_account_tiers
    SET tier = ${tier}::risk_tier, basis = ${JSON.stringify(basis)}::jsonb, evaluated_at = clock_timestamp()
    WHERE user_id = ${userId}::uuid
  `;

  return { basis, changed: previous?.tier !== tier, tier };
}

export { evaluateTier, findStandingPaidOrder };
export type { RiskTierName, TierBasis, TierResult };

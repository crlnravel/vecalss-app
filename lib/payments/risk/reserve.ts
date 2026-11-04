import "server-only";

import { hasActiveFullAccess } from "@/lib/billing/service";
import { getPlanPrice, isPricingPlanId, PRICING_SCHEDULE } from "@/lib/pricing/schedule";

import { checkBlocks } from "@/lib/fraud/blocks";
import { FraudConfigError } from "@/lib/fraud/errors";
import { flagBlockedAttempt } from "@/lib/fraud/signals";

import { writePaymentAudit } from "../audit";
import { lockAccount } from "./account-lock";
import { loadPolicyInForce, type Db, type RiskPolicy } from "./policy";
import { evaluateTier, type RiskTierName, type TierBasis } from "./tier";

/**
 * Why a new checkout was refused. The buyer sees a calm message for each (see
 * the checkout page); the exact rule behind it is never shown.
 */
type RefusalReason =
  | "amount_mismatch"
  | "blocked"
  | "blocks_unavailable"
  | "daily_limit"
  | "full_access_active"
  | "hourly_attempts"
  | "ip_attempts"
  | "missing_ip"
  | "no_policy"
  | "open_payment";

type CheckoutRequest = {
  amountRupiah: number;
  buyerId: string;
  buyerIp: string | null;
  /** Why this checkout may go ahead without a buyer IP, or null when it may not. */
  buyerIpExemption: string | null;
  /** The raw device cookie value of the request, if it carried a valid one. */
  deviceToken?: string | null;
  intentId: string;
  packageCode: string;
  plan: string;
  pricingMonth: string;
};

type CheckoutAllowed = {
  basis: TierBasis;
  /** The Asia/Jakarta day this checkout counts against, as YYYY-MM-DD. */
  bucketDate: string;
  /** HMAC of the request's device cookie, to record on the order. Null without one. */
  deviceLookupToken: string | null;
  policy: RiskPolicy;
  tier: RiskTierName;
};

type CheckoutRefused = {
  policyVersion: number | null;
  reason: RefusalReason;
  tier: RiskTierName | null;
};

/**
 * The price the server quotes for a plan in a pricing month, or null when the
 * pair is unknown. This is the only amount an order may carry.
 */
function expectedQuoteRupiah(plan: string, pricingMonth: string) {
  if (!isPricingPlanId(plan)) return null;
  const entry = PRICING_SCHEDULE.find((item) => item.month === pricingMonth);
  return entry ? getPlanPrice(entry, plan) : null;
}

async function countRows(rows: PromiseLike<Array<{ n: number }>>) {
  const [{ n }] = await rows;
  return n;
}

/**
 * Decides whether a new checkout may start, and takes the locks that make the
 * answer hold until the caller's transaction ends. Nothing here writes anything
 * payable; the caller inserts the order and its reservation next, in the same
 * transaction, or records the refusal.
 *
 * Locks, always in this order: the account's row, then the Asia/Jakarta day
 * bucket row, then (for an IP) an advisory lock on the address. Two checkouts
 * for one account therefore run one after the other, so the last slot and the
 * last rupiah go to exactly one of them. Everything is counted in Postgres from
 * database time; no cache is involved, so an outage elsewhere cannot lift a cap.
 *
 * Checks, in order: a policy is in force; the amount equals the server quote;
 * a Monthly checkout is refused while Full Access runs; a buyer IP exists (or the local stand-in is exempt); no fraud block is in
 * force for the account, its email or phone, the device cookie or the IP (MS-07);
 * one open unpaid payment
 * at a time; unpaid checkouts per account per hour; checkout starts per IP per
 * hour; then the day's count and rupiah for the account's tier.
 */
async function checkCheckoutAllowed(
  tx: Db,
  request: CheckoutRequest,
): Promise<{ allowed: CheckoutAllowed; ok: true } | { ok: false; refused: CheckoutRefused }> {
  const refuse = (reason: RefusalReason, policy: RiskPolicy | null, tier: RiskTierName | null) => ({
    ok: false as const,
    refused: { policyVersion: policy?.version ?? null, reason, tier },
  });

  await lockAccount(tx, request.buyerId);

  // Read after the lock, so a policy change while we waited is the one we use.
  const policy = await loadPolicyInForce(tx);
  if (!policy) return refuse("no_policy", null, null);

  if (request.amountRupiah !== expectedQuoteRupiah(request.plan, request.pricingMonth)) {
    return refuse("amount_mismatch", policy, null);
  }

  // Monthly Access adds nothing to a running Full Access, so it is not sold
  // then (MS-08). Read under the account lock, before any payable session.
  if (request.plan === "monthly" && (await hasActiveFullAccess(tx, request.buyerId))) {
    return refuse("full_access_active", policy, null);
  }

  if (!request.buyerIp && !request.buyerIpExemption) return refuse("missing_ip", policy, null);

  // Blocks are read under the same account lock, with a shared lock on each
  // identifier, so a block created while this checkout runs waits for it (and
  // the other way round). Without a lookup secret the answer cannot be trusted,
  // so nothing is accepted.
  let blockCheck: Awaited<ReturnType<typeof checkBlocks>>;
  try {
    blockCheck = await checkBlocks(
      tx,
      { deviceToken: request.deviceToken, ip: request.buyerIp, userId: request.buyerId },
      { lock: true },
    );
  } catch (error) {
    if (error instanceof FraudConfigError) return refuse("blocks_unavailable", policy, null);
    throw error;
  }
  if (blockCheck.blocked) {
    await flagBlockedAttempt(tx, {
      context: "checkout",
      matches: blockCheck.matches,
      policyVersion: policy.version,
      userId: request.buyerId,
    });
    return refuse("blocked", policy, null);
  }

  const { basis, changed, tier } = await evaluateTier(tx, request.buyerId, policy);
  if (changed) {
    await writePaymentAudit(tx, {
      action: "risk.tier.changed",
      actorUserId: request.buyerId,
      metadata: { ...basis, tier },
      targetId: request.buyerId,
      targetType: "user",
    });
  }

  const open = await countRows(tx.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM payment_orders
    WHERE buyer_id = ${request.buyerId}::uuid AND status = 'pending'
  `);
  if (open >= policy.maxOpenPayments) return refuse("open_payment", policy, tier);

  const unpaidLastHour = await countRows(tx.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM payment_orders
    WHERE buyer_id = ${request.buyerId}::uuid
      AND status IN ('pending', 'failed', 'expired')
      AND created_at > clock_timestamp() - interval '1 hour'
  `);
  if (unpaidLastHour >= policy.maxUnpaidPerAccountHour) return refuse("hourly_attempts", policy, tier);

  if (request.buyerIp) {
    // Serialises starts from one address; different addresses do not wait for each other.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`checkout-ip:${request.buyerIp}`}, 0))`;
    const fromIpLastHour = await countRows(tx.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM payment_orders
      WHERE buyer_ip = ${request.buyerIp}::inet
        AND created_at > clock_timestamp() - interval '1 hour'
    `);
    if (fromIpLastHour >= policy.maxStartsPerIpHour) return refuse("ip_attempts", policy, tier);
  }

  const [{ day }] = await tx.$queryRaw<Array<{ day: string }>>`
    SELECT to_char(risk_jakarta_day(clock_timestamp()), 'YYYY-MM-DD') AS day
  `;
  await tx.$executeRaw`
    INSERT INTO risk_day_buckets (user_id, bucket_date)
    VALUES (${request.buyerId}::uuid, ${day}::date)
    ON CONFLICT (user_id, bucket_date) DO NOTHING
  `;
  const [bucket] = await tx.$queryRaw<Array<{ amount: number; count: number }>>`
    SELECT purchase_count AS count, amount_rupiah AS amount
    FROM risk_day_buckets
    WHERE user_id = ${request.buyerId}::uuid AND bucket_date = ${day}::date
    FOR UPDATE
  `;
  const maxPurchases = tier === "verified" ? policy.verifiedDailyPurchases : policy.unverifiedDailyPurchases;
  const maxRupiah = tier === "verified" ? policy.verifiedDailyRupiah : policy.unverifiedDailyRupiah;
  if (bucket.count + 1 > maxPurchases || bucket.amount + request.amountRupiah > maxRupiah) {
    return refuse("daily_limit", policy, tier);
  }

  return { allowed: { basis, bucketDate: day, deviceLookupToken: blockCheck.deviceLookupToken, policy, tier }, ok: true };
}

/**
 * Takes the reservation for a new order, on the day the checkout started. The
 * day bucket's counters follow in the same statement (a database trigger).
 */
async function takeReservation(
  tx: Db,
  input: { allowed: CheckoutAllowed; amountRupiah: number; buyerId: string; orderId: string },
) {
  await tx.$executeRaw`
    INSERT INTO risk_reservations (order_id, user_id, bucket_date, amount_rupiah, tier, tier_basis, policy_version)
    VALUES (
      ${input.orderId}::uuid, ${input.buyerId}::uuid, ${input.allowed.bucketDate}::date, ${input.amountRupiah},
      ${input.allowed.tier}::risk_tier, ${JSON.stringify(input.allowed.basis)}::jsonb, ${input.allowed.policy.version}
    )
  `;
}

/**
 * Records a refused checkout. Only a reason code, the policy version and tier,
 * the intent and the IP that is already stored with orders are written; the
 * buyer's own details are not copied into the audit trail.
 */
async function recordCheckoutRefusal(
  tx: Db,
  request: CheckoutRequest,
  refused: CheckoutRefused,
  buyerIpSource: string,
) {
  await writePaymentAudit(tx, {
    action: "payment.checkout.refused",
    actorUserId: request.buyerId,
    ipAddress: request.buyerIp,
    metadata: {
      amountRupiah: request.amountRupiah,
      buyerIpSource,
      packageCode: request.packageCode,
      policyVersion: refused.policyVersion,
      reason: refused.reason,
      tier: refused.tier,
    },
    targetId: request.intentId,
    targetType: "checkout_intent",
  });
}

type ReservationMove = "paid" | "released" | "review";

const MOVE_FROM: Record<ReservationMove, Array<"pending" | "released">> = {
  paid: ["pending"],
  released: ["pending"],
  // A late payment (after a confirmed expiry), or a payment held while still pending.
  review: ["released", "pending"],
};

/**
 * Follows an order's transition on its reservation, inside the transaction
 * that moves the order:
 *
 * - paid: the exposure stays counted, now as a completed purchase;
 * - released (the order failed or expired, confirmed by the provider): the
 *   exposure is freed on its original day;
 * - review (a payment arrived after that, or the buyer was blocked while the
 *   order was pending): the exposure is held again on the original day, even
 *   past the cap, because the money exists.
 *
 * A refund is not a transition here: it never gives the day's allowance back
 * (MS-09 adds refunds without touching this). Orders created before the
 * limits existed have no reservation and are left alone. It does not read the
 * policy, so ingestion keeps working when none is in force. Returns whether a
 * reservation moved; the caller records that in the order's own audit event.
 */
async function moveReservation(tx: Db, orderId: string, to: ReservationMove, reason: string | null) {
  const moved = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE risk_reservations
    SET state = ${to}::risk_reservation_state, state_reason = ${reason}, state_changed_at = now()
    WHERE order_id = ${orderId}::uuid AND state::text = ANY(${MOVE_FROM[to]})
    RETURNING id
  `;
  return moved.length === 1;
}

export {
  checkCheckoutAllowed,
  expectedQuoteRupiah,
  lockAccount,
  moveReservation,
  recordCheckoutRefusal,
  takeReservation,
};
export type { CheckoutAllowed, CheckoutRefused, CheckoutRequest, RefusalReason, ReservationMove };

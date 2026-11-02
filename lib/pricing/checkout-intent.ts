import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

import {
  getPlanPrice,
  type PricingPlanId,
  type PricingScheduleEntry,
} from "./schedule";

type CheckoutEnv = Partial<Record<string, string | undefined>>;

const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** How long a submitted quote may be reused by a retry of the same form. */
const CHECKOUT_INTENT_TTL_MS = 30 * 60 * 1000;
const KILL_SWITCH_OFF_VALUES = new Set(["", "0", "false", "off", "no"]);

/**
 * Server config that pauses new checkouts. Any value other than an explicit
 * "off" word turns it on, so a typo pauses checkout rather than leaving it
 * open. It only gates the checkout submission; the purchase callback does not
 * read it.
 */
function isCheckoutPaused(env: CheckoutEnv = process.env) {
  const value = env.CHECKOUT_KILL_SWITCH?.trim().toLowerCase() ?? "";
  return !KILL_SWITCH_OFF_VALUES.has(value);
}

/** Minted while the checkout page renders; nothing is stored until submission. */
function createCheckoutIdempotencyKey() {
  return randomUUID();
}

function parseCheckoutIdempotencyKey(value: unknown) {
  return typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
}

type CheckoutIntentInput = {
  buyerId: string;
  entry: PricingScheduleEntry;
  idempotencyKey: string;
  now: Date;
  plan: PricingPlanId;
  referralCode: string | null;
};

type CheckoutIntentRecord = {
  amountRupiah: number;
  id: string;
  plan: string;
  pricingMonth: string;
  referralCode: string | null;
};

type CheckoutIntentResult =
  | { intent: CheckoutIntentRecord; status: "created" | "reused" }
  | { status: "conflict" }
  | { status: "expired" };

/**
 * Records the buyer's checkout intent, or returns the one already stored for
 * the same buyer and key. The insert is skipped on a key collision, so two
 * concurrent submissions of one form still end up with one row. A retry within
 * CHECKOUT_INTENT_TTL_MS keeps the original quote; after that the key is
 * "expired" and the buyer must confirm the current price on a fresh page. The
 * same key with a different plan or referral is a conflict. Neither writes.
 */
async function resolveCheckoutIntent(
  { buyerId, entry, idempotencyKey, now, plan, referralCode }: CheckoutIntentInput,
): Promise<CheckoutIntentResult> {
  const { count } = await prisma.checkoutIntent.createMany({
    data: [{
      amountRupiah: getPlanPrice(entry, plan),
      buyerId,
      expiresAt: new Date(now.getTime() + CHECKOUT_INTENT_TTL_MS),
      idempotencyKey,
      plan,
      pricingMonth: entry.month,
      referralCode,
    }],
    skipDuplicates: true,
  });

  const stored = await prisma.checkoutIntent.findUnique({
    select: {
      amountRupiah: true,
      expiresAt: true,
      id: true,
      plan: true,
      pricingMonth: true,
      referralCode: true,
    },
    where: { buyerId_idempotencyKey: { buyerId, idempotencyKey } },
  });
  if (!stored) return { status: "conflict" };
  if (stored.expiresAt.getTime() <= now.getTime()) return { status: "expired" };

  if (stored.plan !== plan || stored.referralCode !== referralCode) {
    return { status: "conflict" };
  }

  return { intent: stored, status: count === 1 ? "created" : "reused" };
}

export {
  CHECKOUT_INTENT_TTL_MS,
  createCheckoutIdempotencyKey,
  isCheckoutPaused,
  parseCheckoutIdempotencyKey,
  resolveCheckoutIntent,
};
export type { CheckoutIntentInput, CheckoutIntentRecord, CheckoutIntentResult };

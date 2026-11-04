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
  plan: PricingPlanId;
  referralCode: string | null;
  /** The version of the purchase terms the buyer ticked. */
  termsVersion: string;
};

type CheckoutIntentRecord = {
  amountRupiah: number;
  id: string;
  plan: string;
  pricingMonth: string;
  referralCode: string | null;
  termsVersion: string | null;
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
 *
 * The validity window is judged on the database clock, both when it is set and
 * when it is checked, so a server with a skewed clock cannot extend or cut it.
 */
async function resolveCheckoutIntent(
  { buyerId, entry, idempotencyKey, plan, referralCode, termsVersion }: CheckoutIntentInput,
): Promise<CheckoutIntentResult> {
  const inserted = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO checkout_intents (
      buyer_id, idempotency_key, plan, pricing_month, amount_rupiah, referral_code, terms_version, expires_at
    )
    VALUES (
      ${buyerId}::uuid, ${idempotencyKey}, ${plan}, ${entry.month}, ${getPlanPrice(entry, plan)},
      ${referralCode}, ${termsVersion}, now() + make_interval(secs => ${CHECKOUT_INTENT_TTL_MS / 1000}::double precision)
    )
    ON CONFLICT (buyer_id, idempotency_key) DO NOTHING
    RETURNING id
  `;

  const [stored] = await prisma.$queryRaw<Array<CheckoutIntentRecord & { expired: boolean }>>`
    SELECT id, plan, pricing_month AS "pricingMonth", amount_rupiah AS "amountRupiah",
           referral_code AS "referralCode", terms_version AS "termsVersion", expires_at <= now() AS expired
    FROM checkout_intents
    WHERE buyer_id = ${buyerId}::uuid AND idempotency_key = ${idempotencyKey}
  `;
  if (!stored) return { status: "conflict" };
  if (stored.expired) return { status: "expired" };

  if (stored.plan !== plan || stored.referralCode !== referralCode || stored.termsVersion !== termsVersion) {
    return { status: "conflict" };
  }

  return {
    intent: {
      amountRupiah: stored.amountRupiah,
      id: stored.id,
      plan: stored.plan,
      pricingMonth: stored.pricingMonth,
      referralCode: stored.referralCode,
      termsVersion: stored.termsVersion,
    },
    status: inserted.length === 1 ? "created" : "reused",
  };
}

export {
  CHECKOUT_INTENT_TTL_MS,
  createCheckoutIdempotencyKey,
  isCheckoutPaused,
  parseCheckoutIdempotencyKey,
  resolveCheckoutIntent,
};
export type { CheckoutIntentInput, CheckoutIntentRecord, CheckoutIntentResult };

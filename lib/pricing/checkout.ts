import type { PricingPlanId, PricingScheduleEntry } from "./schedule";
import { getPlanPrice } from "./schedule";

type CheckoutEnv = Partial<Record<string, string | undefined>>;

const PACKAGE_CODE_ENV_KEYS = {
  fullMandiri: "PRICING_PACKAGE_CODE_FULL_MANDIRI",
  fullUtbk: "PRICING_PACKAGE_CODE_FULL_UTBK",
  monthly: "PRICING_PACKAGE_CODE_MONTHLY",
} as const;

function readEnv(env: CheckoutEnv, key: string) {
  const value = env[key]?.trim();
  return value ? value : null;
}

/**
 * The checkout service origin comes from CHECKOUT_BASE_URL. It is never
 * defaulted: without it the pricing page shows prices but disables purchase.
 */
function getCheckoutBaseUrl(env: CheckoutEnv = process.env) {
  const raw = readEnv(env, "CHECKOUT_BASE_URL");
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (
    !["http:", "https:"].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.hash
    || (env.NODE_ENV === "production" && parsed.protocol !== "https:")
  ) {
    return null;
  }

  return parsed;
}

function getPackageCode(
  plan: PricingPlanId,
  entry: PricingScheduleEntry,
  env: CheckoutEnv = process.env,
) {
  if (plan === "monthly") return readEnv(env, PACKAGE_CODE_ENV_KEYS.monthly);

  return readEnv(
    env,
    entry.fullTarget === "mandiri"
      ? PACKAGE_CODE_ENV_KEYS.fullMandiri
      : PACKAGE_CODE_ENV_KEYS.fullUtbk,
  );
}

type CheckoutRequest = {
  entry: PricingScheduleEntry;
  plan: PricingPlanId;
  referralCode: string | null;
  studentId: string;
};

/**
 * Returns null when the checkout service or the plan's package code is not
 * configured, so callers can report the gap instead of guessing.
 *
 * The query parameter names below are provisional until the payment gateway
 * documentation is available; this function is the only place that shapes the
 * outgoing checkout URL.
 */
function buildCheckoutUrl(
  { entry, plan, referralCode, studentId }: CheckoutRequest,
  env: CheckoutEnv = process.env,
) {
  const baseUrl = getCheckoutBaseUrl(env);
  const packageCode = getPackageCode(plan, entry, env);
  if (!baseUrl || !packageCode) return null;

  const url = new URL(baseUrl);
  url.searchParams.set("package", packageCode);
  url.searchParams.set("amount", String(getPlanPrice(entry, plan)));
  url.searchParams.set("student", studentId);
  if (referralCode) url.searchParams.set("ref", referralCode);

  return url;
}

function isCheckoutConfigured(
  entry: PricingScheduleEntry,
  env: CheckoutEnv = process.env,
) {
  return getCheckoutBaseUrl(env) !== null
    && (["monthly", "full"] as const).every(
      (plan) => getPackageCode(plan, entry, env) !== null,
    );
}

export {
  PACKAGE_CODE_ENV_KEYS,
  buildCheckoutUrl,
  getCheckoutBaseUrl,
  getPackageCode,
  isCheckoutConfigured,
};
export type { CheckoutRequest };

import type { PricingPlanId, PricingScheduleEntry } from "./schedule";

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
 * The published package a plan sells, from configuration. Null when it is not
 * set, so callers can report the gap instead of guessing.
 *
 * The browser is never sent to a URL built from this: the amount, package and
 * buyer live on the server-side order, and the payment provider is reached
 * through lib/payments (see ensurePaymentSession).
 */
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

export { PACKAGE_CODE_ENV_KEYS, getPackageCode };

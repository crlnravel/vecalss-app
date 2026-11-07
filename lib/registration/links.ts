import { getSafePricingReturnPath } from "@/lib/auth/paths";

/**
 * What a buyer carries through signup: where to land afterwards (only a pricing
 * or checkout path, never anything else) and an affiliate referral code. Both
 * travel in the links and the hidden fields, are re-checked wherever they are
 * read, and are never trusted as given.
 */

const REFERRAL_PATTERN = /^[A-Za-z0-9-]{3,40}$/u;

type SignupContinuation = { ref: string | null; returnTo: string | null };

/** A referral code as typed in a link, or null when it is missing or not a plausible code. */
function readReferral(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim();
  return REFERRAL_PATTERN.test(code) ? code : null;
}

function readContinuation(input: { ref?: unknown; returnTo?: unknown }): SignupContinuation {
  return { ref: readReferral(input.ref), returnTo: getSafePricingReturnPath(input.returnTo) };
}

/** Query string for the links of the signup flow ("" when there is nothing to carry). */
function continuationQuery({ ref, returnTo }: SignupContinuation) {
  const params = new URLSearchParams();
  if (returnTo) params.set("returnTo", returnTo);
  if (ref) params.set("ref", ref);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * The sign-in destination after verifying: back to checkout (or wherever the
 * buyer was headed), else the pricing page with the referral code, else nothing
 * (sign-in then goes to onboarding).
 */
function postVerificationReturnTo({ ref, returnTo }: SignupContinuation) {
  if (returnTo) return returnTo;
  if (ref) return getSafePricingReturnPath(`/pricing?${new URLSearchParams({ ref })}`);
  return null;
}

export { continuationQuery, postVerificationReturnTo, readContinuation, readReferral };
export type { SignupContinuation };

import { readRequestBytesAtMost } from "@/lib/admin/imports/request";
import { findActiveReferralCode } from "@/lib/affiliator/service";
import { RoleName } from "@/generated/prisma/client";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import type { SessionContext } from "@/lib/auth/types";
import { getAppBaseUrl } from "@/lib/config";

import { buildCheckoutUrl } from "./checkout";
import {
  isCheckoutPaused,
  parseCheckoutIdempotencyKey,
  resolveCheckoutIntent,
} from "./checkout-intent";
import {
  isPricingPlanId,
  PRICING_SCHEDULE,
  resolvePricing,
} from "./schedule";

const MAX_FORM_BYTES = 4 * 1024;
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

type CheckoutPayDeps = {
  env: NodeJS.ProcessEnv;
  getSession: () => Promise<SessionContext | null>;
  now: () => Date;
};

const defaultDeps: CheckoutPayDeps = {
  env: process.env,
  getSession: getSessionContext,
  now: () => new Date(),
};

function redirectTo(target: string | URL, base: string | URL) {
  return new Response(null, {
    headers: { ...NO_STORE_HEADERS, Location: new URL(target, base).toString() },
    status: 303,
  });
}

function pathWithQuery(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Browsers always send Origin on a cross-site POST, so a missing or foreign
 * Origin is rejected before the session, the database or the body is touched.
 */
function isSameOrigin(request: Request, env: NodeJS.ProcessEnv) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return origin === getAppBaseUrl(env);
  } catch {
    return false;
  }
}

async function readForm(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) return null;

  const bytes = await readRequestBytesAtMost(request, MAX_FORM_BYTES);
  if (bytes === null) return null;

  try {
    return new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

/**
 * GET and HEAD never create anything. Links and bookmarks to the old pay URL
 * land on the checkout page, where the buyer confirms with a button.
 */
function handleCheckoutPayRedirect(
  request: Request,
  deps: Pick<CheckoutPayDeps, "env"> = defaultDeps,
) {
  const base = getAppBaseUrl(deps.env);
  const { searchParams } = new URL(request.url);
  const plan = searchParams.get("plan");
  if (!isPricingPlanId(plan)) return redirectTo("/pricing", base);

  const ref = (searchParams.get("ref")?.trim() ?? "").slice(0, 40);
  return redirectTo(pathWithQuery("/pricing/checkout", ref ? { plan, ref } : { plan }), base);
}

async function handleCheckoutPayPost(request: Request, deps: CheckoutPayDeps = defaultDeps) {
  if (!isSameOrigin(request, deps.env)) {
    return new Response("Forbidden", { headers: NO_STORE_HEADERS, status: 403 });
  }

  const base = getAppBaseUrl(deps.env);
  const form = await readForm(request);
  if (!form) return redirectTo("/pricing", base);

  const plan = form.get("plan");
  if (!isPricingPlanId(plan)) return redirectTo("/pricing", base);

  const rawReferral = (form.get("ref")?.trim() ?? "").slice(0, 40);
  const checkoutParams: Record<string, string> = rawReferral ? { plan, ref: rawReferral } : { plan };
  const checkoutPage = (extra: Record<string, string> = {}) =>
    redirectTo(pathWithQuery("/pricing/checkout", { ...checkoutParams, ...extra }), base);

  const session = await deps.getSession();
  if (!session) {
    const returnTo = pathWithQuery("/pricing/checkout", checkoutParams);
    return redirectTo(pathWithQuery("/login", { returnTo }), base);
  }

  if (!hasRole(session, RoleName.student)) {
    return redirectTo(pathWithQuery("/pricing", { notice: "student-only" }), base);
  }

  if (isCheckoutPaused(deps.env)) return checkoutPage();

  const idempotencyKey = parseCheckoutIdempotencyKey(form.get("key"));
  if (!idempotencyKey) return checkoutPage({ notice: "checkout-changed" });

  let referralCode: string | null = null;
  if (rawReferral) {
    referralCode = await findActiveReferralCode(rawReferral);
    if (!referralCode) return checkoutPage();
  }

  const { entry } = resolvePricing(deps.now());
  if (!entry) return redirectTo("/pricing", base);

  const result = await resolveCheckoutIntent({
    buyerId: session.user.id,
    entry,
    idempotencyKey,
    plan,
    referralCode,
  });
  if (result.status === "conflict") return checkoutPage({ notice: "checkout-changed" });

  // A retry keeps the quote it was first given, even across a price change.
  const quotedEntry = PRICING_SCHEDULE.find((item) => item.month === result.intent.pricingMonth);
  const checkoutUrl = quotedEntry
    ? buildCheckoutUrl({ entry: quotedEntry, plan, referralCode, studentId: session.user.id }, deps.env)
    : null;
  if (!checkoutUrl) return checkoutPage({ notice: "checkout-unavailable" });

  return redirectTo(checkoutUrl, checkoutUrl);
}

export { handleCheckoutPayPost, handleCheckoutPayRedirect };
export type { CheckoutPayDeps };

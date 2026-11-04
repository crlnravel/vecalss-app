import { readRequestBytesAtMost } from "@/lib/admin/imports/request";
import { findActiveReferralCode } from "@/lib/affiliator/service";
import { RoleName } from "@/generated/prisma/client";
import { getTrustedProxyCount, resolveClientIpAddress } from "@/lib/auth/request";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import type { SessionContext } from "@/lib/auth/types";
import { getAppBaseUrl } from "@/lib/config";
import type { PaymentProviderAdapter } from "@/lib/payments/adapter";
import { createOrderFromIntent, ensurePaymentSession } from "@/lib/payments/orders";
import { getPaymentProvider } from "@/lib/payments/provider";
import { resolveBuyerIpExemption } from "@/lib/payments/risk/buyer-ip";
import type { RefusalReason } from "@/lib/payments/risk/reserve";

import { buildDeviceSetCookie, readDeviceTokenFromHeader } from "@/lib/fraud/device";
import { isLookupSecretAvailable, newDeviceToken } from "@/lib/fraud/tokens";

import { PURCHASE_TERMS, termsOpenForCheckout, type PurchaseTerms } from "@/lib/fulfillment/terms";

import { getPackageCode } from "./checkout";
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

const REJECTED_PAGE = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Permintaan belum bisa diproses | Vecalss</title>
<style>body{font-family:system-ui,sans-serif;line-height:1.6;margin:0;padding:4rem 1.25rem;color:#14231d}main{max-width:32rem;margin:0 auto}a{color:#014c38;font-weight:600}</style>
</head>
<body>
<main>
<h1>Permintaan belum bisa diproses</h1>
<p>Kami tidak bisa memastikan permintaan ini datang dari halaman checkout Vecalss. Buka lagi halaman harga, pilih paketmu, lalu coba sekali lagi.</p>
<p><a href="/pricing">Kembali ke halaman harga</a></p>
</main>
</body>
</html>`;

/**
 * What a buyer is told when the limits refuse a new checkout. Several rules can
 * share a notice, so the exact rule is never revealed. With no policy in force
 * the checkout page itself shows the "paused" notice.
 */
const REFUSAL_NOTICES: Record<Exclude<RefusalReason, "blocks_unavailable" | "no_policy"> | "package_unavailable" | "terms_required", string> = {
  amount_mismatch: "checkout-unavailable",
  blocked: "checkout-blocked",
  daily_limit: "checkout-daily-limit",
  full_access_active: "checkout-full-access",
  hourly_attempts: "checkout-too-many",
  ip_attempts: "checkout-too-many",
  missing_ip: "checkout-unavailable",
  open_payment: "checkout-open-payment",
  package_unavailable: "checkout-unavailable",
  terms_required: "checkout-terms",
};

type CheckoutPayDeps = {
  env: NodeJS.ProcessEnv;
  getSession: () => Promise<SessionContext | null>;
  now: () => Date;
  /** The payment provider; null means none is configured and checkout stays closed. */
  getProvider?: (env: NodeJS.ProcessEnv) => PaymentProviderAdapter | null;
  /** The terms in force. Tests only: the app always uses PURCHASE_TERMS. */
  terms?: PurchaseTerms;
};

const defaultDeps: CheckoutPayDeps = {
  env: process.env,
  getProvider: (env) => getPaymentProvider(env),
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

/**
 * The device cookie rides on every answer to a same-origin POST, so the order
 * made here and the next sign-in see the same random value. Only an HMAC of it
 * is ever stored (lib/fraud). A cross-site request gets nothing.
 */
async function handleCheckoutPayPost(request: Request, deps: CheckoutPayDeps = defaultDeps) {
  const existingDeviceToken = readDeviceTokenFromHeader(request.headers.get("cookie"));
  const deviceToken = existingDeviceToken ?? newDeviceToken();

  const response = await processCheckoutPayPost(request, deps, deviceToken);
  if (!existingDeviceToken && response.status !== 403) {
    response.headers.append("Set-Cookie", buildDeviceSetCookie(deviceToken, deps.env.NODE_ENV === "production"));
  }
  return response;
}

async function processCheckoutPayPost(request: Request, deps: CheckoutPayDeps, deviceToken: string) {
  if (!isSameOrigin(request, deps.env)) {
    return new Response(REJECTED_PAGE, {
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
      },
      status: 403,
    });
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

  // With no payment provider there is nothing to pay through, so checkout stays
  // closed and nothing is written: the page shows the same paused notice.
  const provider = (deps.getProvider ?? defaultDeps.getProvider!)(deps.env);
  if (!provider) return checkoutPage();

  // Terms still marked draft cannot be accepted with a real provider (MS-19 M-05): same paused page, nothing written.
  if (!termsOpenForCheckout(provider.id, deps.terms)) return checkoutPage();

  // Blocks cannot be looked up without their secret, so nothing is accepted.
  if (!isLookupSecretAvailable(deps.env)) return checkoutPage();

  const idempotencyKey = parseCheckoutIdempotencyKey(form.get("key"));
  if (!idempotencyKey) return checkoutPage({ notice: "checkout-changed" });

  // The buyer must tick agreement to the current Syarat Pembelian. Nothing is
  // written before this: no intent, no order, no reservation. An old page that
  // names an earlier version does not count either, so the buyer reads the
  // current text first.
  if (form.get("terms") !== PURCHASE_TERMS.version) return checkoutPage({ notice: "checkout-terms" });

  let referralCode: string | null = null;
  if (rawReferral) {
    referralCode = await findActiveReferralCode(rawReferral);
    if (!referralCode) return checkoutPage();
  }

  const now = deps.now();
  const { entry } = resolvePricing(now);
  if (!entry) return redirectTo("/pricing", base);

  const result = await resolveCheckoutIntent({
    buyerId: session.user.id,
    entry,
    idempotencyKey,
    plan,
    referralCode,
    termsVersion: PURCHASE_TERMS.version,
  });
  if (result.status === "expired") return checkoutPage({ notice: "checkout-expired" });
  if (result.status === "conflict") return checkoutPage({ notice: "checkout-changed" });

  // A retry within the validity window keeps the quote it was first given.
  const quotedEntry = PRICING_SCHEDULE.find((item) => item.month === result.intent.pricingMonth);
  const packageCode = quotedEntry ? getPackageCode(plan, quotedEntry, deps.env) : null;
  if (!packageCode) return checkoutPage({ notice: "checkout-unavailable" });

  const trustedProxyCount = getTrustedProxyCount(deps.env);
  const buyerIp = resolveClientIpAddress(request.headers.get("x-forwarded-for"), trustedProxyCount);
  const created = await createOrderFromIntent({
    buyerId: session.user.id,
    buyerIp,
    buyerIpExemption: resolveBuyerIpExemption(provider, deps.env),
    buyerIpSource: buyerIp ? `trusted-proxy:${trustedProxyCount}` : "unavailable",
    deviceToken,
    intent: result.intent,
    packageCode,
    provider,
  });
  if (!created.ok) {
    return created.reason === "no_policy" || created.reason === "blocks_unavailable"
      ? checkoutPage()
      : checkoutPage({ notice: REFUSAL_NOTICES[created.reason] });
  }
  const { order } = created;

  const statusPage = redirectTo(`/pricing/checkout/status/${order.reference}`, base);
  const payment = await ensurePaymentSession(order, provider, base);
  if (!payment.ok) {
    return payment.reason === "closed" ? statusPage : checkoutPage({ notice: "checkout-unavailable" });
  }

  return redirectTo(payment.checkoutUrl, base);
}

export { handleCheckoutPayPost, handleCheckoutPayRedirect };
export type { CheckoutPayDeps };

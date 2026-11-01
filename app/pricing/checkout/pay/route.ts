import { RoleName } from "@/generated/prisma/client";
import { findActiveReferralCode } from "@/lib/affiliator/service";
import { getAppBaseUrl } from "@/lib/config";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import { buildCheckoutUrl } from "@/lib/pricing/checkout";
import { isPricingPlanId, resolvePricing } from "@/lib/pricing/schedule";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

function redirectTo(target: string | URL, base: string | URL = getAppBaseUrl()) {
  return new Response(null, {
    headers: { ...NO_STORE_HEADERS, Location: new URL(target, base).toString() },
    status: 303,
  });
}

function pathWithQuery(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return query ? `${path}?${query}` : path;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const plan = searchParams.get("plan");
  const rawReferral = (searchParams.get("ref")?.trim() ?? "").slice(0, 40);

  if (!isPricingPlanId(plan)) return redirectTo("/pricing");

  const checkoutParams: Record<string, string> = rawReferral ? { plan, ref: rawReferral } : { plan };

  const session = await getSessionContext();
  if (!session) {
    const returnTo = pathWithQuery("/pricing/checkout", checkoutParams);
    return redirectTo(pathWithQuery("/login", { returnTo }));
  }

  if (!hasRole(session, RoleName.student)) {
    return redirectTo(pathWithQuery("/pricing", { notice: "student-only" }));
  }

  let referralCode: string | null = null;
  if (rawReferral) {
    referralCode = await findActiveReferralCode(rawReferral);
    if (!referralCode) return redirectTo(pathWithQuery("/pricing/checkout", checkoutParams));
  }

  const { entry } = resolvePricing();
  if (!entry) return redirectTo("/pricing");

  const checkoutUrl = buildCheckoutUrl({
    entry,
    plan,
    referralCode,
    studentId: session.user.id,
  });
  if (!checkoutUrl) {
    return redirectTo(
      pathWithQuery("/pricing/checkout", { ...checkoutParams, notice: "checkout-unavailable" }),
    );
  }

  return redirectTo(checkoutUrl, checkoutUrl);
}

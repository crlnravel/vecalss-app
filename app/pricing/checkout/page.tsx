import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RoleName } from "@/generated/prisma/client";
import { findActiveReferralCode } from "@/lib/affiliator/service";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import { getCheckoutBaseUrl, getPackageCode } from "@/lib/pricing/checkout";
import { isPricingPlanId, resolvePricing } from "@/lib/pricing/schedule";
import PricingCheckoutPageModule, {
  type ReferralStatus,
} from "@/modules/pricing/PricingCheckoutPageModule";

export const metadata: Metadata = {
  title: "Checkout | Vecalss",
  robots: { follow: false, index: false },
};

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function resolveReferral(raw: string) {
  if (!raw) return { code: "", status: "none" as ReferralStatus };

  try {
    const active = await findActiveReferralCode(raw);
    return active
      ? { code: active, status: "active" as ReferralStatus }
      : { code: raw, status: "invalid" as ReferralStatus };
  } catch {
    return { code: raw, status: "unchecked" as ReferralStatus };
  }
}

export default async function PricingCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const plan = firstValue(params.plan);
  if (!isPricingPlanId(plan)) redirect("/pricing");

  const rawReferral = (firstValue(params.ref)?.trim() ?? "").slice(0, 40);

  const session = await getSessionContext();
  if (!session) {
    const query = new URLSearchParams(rawReferral ? { plan, ref: rawReferral } : { plan });
    redirect(`/login?${new URLSearchParams({ returnTo: `/pricing/checkout?${query}` })}`);
  }

  if (!hasRole(session, RoleName.student)) redirect("/pricing?notice=student-only");

  const { entry } = resolvePricing();
  if (!entry) redirect("/pricing");

  const referral = await resolveReferral(rawReferral);
  const checkoutReady = getCheckoutBaseUrl() !== null && getPackageCode(plan, entry) !== null;

  return (
    <PricingCheckoutPageModule
      checkoutReady={checkoutReady}
      entry={entry}
      notice={firstValue(params.notice) === "checkout-unavailable" ? "checkout-unavailable" : null}
      plan={plan}
      referralCode={referral.code}
      referralStatus={referral.status}
    />
  );
}

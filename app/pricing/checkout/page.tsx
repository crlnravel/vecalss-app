import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RoleName } from "@/generated/prisma/client";
import { findActiveReferralCode } from "@/lib/affiliator/service";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import { getSupportContact } from "@/lib/config";
import { isLookupSecretAvailable } from "@/lib/fraud/tokens";
import { getPaymentProvider } from "@/lib/payments/provider";
import { isPolicyInForce } from "@/lib/payments/risk/policy";
import { prisma } from "@/lib/prisma";
import { getPackageCode } from "@/lib/pricing/checkout";
import { createCheckoutIdempotencyKey, isCheckoutPaused } from "@/lib/pricing/checkout-intent";
import { isPricingPlanId, resolvePricing } from "@/lib/pricing/schedule";
import PricingCheckoutPageModule, {
  type CheckoutNotice,
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
  // No payment provider means nothing to pay through, which looks the same to
  // the buyer as a paused checkout: the notice shows and the button is off.
  // The same goes for a missing purchase-limit policy: nothing is accepted
  // until one is in force. Fraud blocks cannot be looked up without their
  // secret, so that closes checkout too.
  const paused = isCheckoutPaused()
    || getPaymentProvider() === null
    || !isLookupSecretAvailable()
    || !(await isPolicyInForce());
  const checkoutReady = !paused && getPackageCode(plan, entry) !== null;
  const requestedNotice = firstValue(params.notice);
  const notice: CheckoutNotice | null = paused
    ? "checkout-paused"
    : requestedNotice === "checkout-blocked"
      || requestedNotice === "checkout-unavailable"
      || requestedNotice === "checkout-changed"
      || requestedNotice === "checkout-expired"
      || requestedNotice === "checkout-daily-limit"
      || requestedNotice === "checkout-open-payment"
      || requestedNotice === "checkout-too-many"
      ? requestedNotice
      : null;

  // A buyer told about an unfinished payment can go straight back to it.
  const openPayment = notice === "checkout-open-payment"
    ? await prisma.paymentOrder.findFirst({
        orderBy: { createdAt: "desc" },
        select: { reference: true },
        where: { buyerId: session.user.id, status: "pending" },
      })
    : null;

  return (
    <PricingCheckoutPageModule
      checkoutReady={checkoutReady}
      entry={entry}
      intentKey={createCheckoutIdempotencyKey()}
      notice={notice}
      openPaymentHref={openPayment ? `/pricing/checkout/status/${openPayment.reference}` : null}
      plan={plan}
      referralCode={referral.code}
      referralStatus={referral.status}
      supportContact={getSupportContact()}
    />
  );
}

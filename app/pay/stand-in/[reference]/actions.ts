"use server";

import { notFound, redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth/session";
import { getAppBaseUrl } from "@/lib/config";
import { handlePaymentEventRequest } from "@/lib/payments/inbox-http";
import { getPaymentProvider } from "@/lib/payments/provider";
import { STAND_IN_PROVIDER_ID, StandInProvider } from "@/lib/payments/stand-in/provider";
import { prisma } from "@/lib/prisma";

const OUTCOMES = ["succeeded", "failed", "expired"] as const;

/**
 * What the stand-in provider does when the buyer picks an outcome: settle its
 * own record, then send the signed event to the payment inbox like a real
 * provider would. Only the buyer of the order can do this, and only while the
 * stand-in is enabled (a local database).
 */
export async function settleStandInPayment(formData: FormData) {
  const provider = getPaymentProvider();
  if (!(provider instanceof StandInProvider) || provider.id !== STAND_IN_PROVIDER_ID) notFound();

  const session = await getSessionContext();
  if (!session) redirect("/login");

  const reference = formData.get("reference");
  const outcome = formData.get("outcome");
  if (typeof reference !== "string" || !OUTCOMES.some((value) => value === outcome)) notFound();

  const order = await prisma.paymentOrder.findFirst({
    select: { id: true },
    where: { buyerId: session.user.id, reference },
  });
  if (!order) notFound();

  const event = await provider.settle(reference, outcome as (typeof OUTCOMES)[number], new Date());
  if (event) {
    await handlePaymentEventRequest(
      new Request(`${getAppBaseUrl()}/api/payments/events/${provider.id}`, {
        body: event.body as BodyInit,
        headers: event.headers,
        method: "POST",
      }),
      provider.id,
      { getProvider: () => provider },
    );
  }

  redirect(`/pricing/checkout/status/${reference}`);
}

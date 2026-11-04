"use server";

import { notFound, redirect } from "next/navigation";

import { requireAdminSession } from "@/lib/auth/access";
import { getAppBaseUrl } from "@/lib/config";
import { handlePaymentEventRequest } from "@/lib/payments/inbox-http";
import { getStandInProvider } from "@/lib/payments/provider";
import { prisma } from "@/lib/prisma";

const OUTCOMES = ["succeeded", "failed"] as const;

/**
 * What the stand-in provider does when someone settles a refund it holds:
 * update its own record, then send the signed refund event to the real payment
 * inbox like a real provider would. Only an admin with a verified second
 * factor, and only while the stand-in is enabled (a local database).
 */
export async function settleStandInRefund(formData: FormData) {
  const provider = getStandInProvider();
  if (!provider) notFound();

  const session = await requireAdminSession();
  const reference = formData.get("reference");
  const outcome = formData.get("outcome");
  if (typeof reference !== "string" || !OUTCOMES.some((value) => value === outcome)) notFound();

  const refund = await prisma.refundCase.findUnique({ select: { orderId: true }, where: { reference } });
  if (!refund) notFound();

  const event = await provider.settleRefund(reference, outcome as (typeof OUTCOMES)[number], new Date());
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

  void session;
  redirect(`/admin/fraud/orders/${refund.orderId}`);
}

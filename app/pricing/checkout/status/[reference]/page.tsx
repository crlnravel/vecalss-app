import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth/session";
import { getPaymentProvider } from "@/lib/payments/provider";
import { reconcileOrderByReference } from "@/lib/payments/reconcile";
import { prisma } from "@/lib/prisma";
import PaymentStatusPageModule from "@/modules/pricing/PaymentStatusPageModule";

export const metadata: Metadata = {
  title: "Status pembayaran | Vecalss",
  robots: { follow: false, index: false },
};

export const dynamic = "force-dynamic";

const orderSelect = {
  amountRupiah: true,
  expiresAt: true,
  packageName: true,
  sessionUrl: true,
  status: true,
} as const;

function formatClock(date: Date) {
  const time = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(date);

  return `${time.replace(":", ".")} WIB`;
}

/**
 * Where the buyer lands after paying. What it shows is the order's own state;
 * the return from the provider proves nothing. A pending order that has run
 * past its time is checked with the provider once here, so the buyer is not
 * left waiting for the daily job.
 */
export default async function PaymentStatusPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const where = { buyerId: session.user.id, reference };
  let order = await prisma.paymentOrder.findFirst({ select: orderSelect, where });
  if (!order) notFound();

  if (order.status === "pending") {
    const [{ pastExpiry }] = await prisma.$queryRaw<Array<{ pastExpiry: boolean }>>`
      SELECT (expires_at <= now()) AS "pastExpiry" FROM payment_orders WHERE reference = ${reference}
    `;
    const provider = pastExpiry ? getPaymentProvider() : null;
    if (provider) {
      await reconcileOrderByReference(reference, provider);
      order = (await prisma.paymentOrder.findFirst({ select: orderSelect, where })) ?? order;
    }
  }

  return (
    <PaymentStatusPageModule
      amountRupiah={order.amountRupiah}
      expiresAtLabel={formatClock(order.expiresAt)}
      packageName={order.packageName}
      payUrl={order.sessionUrl}
      status={order.status}
    />
  );
}

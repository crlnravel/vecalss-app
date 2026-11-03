import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button-variants";
import { getSessionContext } from "@/lib/auth/session";
import { getPaymentProvider } from "@/lib/payments/provider";
import { STAND_IN_PROVIDER_ID } from "@/lib/payments/stand-in/provider";
import { formatRupiah } from "@/lib/pricing/schedule";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

import { settleStandInPayment } from "./actions";

export const metadata: Metadata = {
  title: "Pembayaran uji coba | Vecalss",
  robots: { follow: false, index: false },
};

export const dynamic = "force-dynamic";

/**
 * The stand-in provider's own payment page. It exists only while the stand-in
 * is enabled (a local database); anywhere else this route is a 404.
 */
export default async function StandInPayPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  if (getPaymentProvider()?.id !== STAND_IN_PROVIDER_ID) notFound();

  const { reference } = await params;
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const order = await prisma.paymentOrder.findFirst({
    select: { amountRupiah: true, packageName: true, status: true },
    where: { buyerId: session.user.id, reference },
  });
  if (!order) notFound();
  if (order.status !== "pending") redirect(`/pricing/checkout/status/${reference}`);

  return (
    <main className="min-h-screen bg-[#eef2f0] px-5 py-16 text-voyage-ink">
      <div className="mx-auto w-full max-w-[480px]">
        <p
          className="rounded-control border border-student-status-attention-border bg-student-status-attention-bg px-4 py-3 text-sm font-semibold leading-6 text-student-status-attention-fg"
          role="note"
        >
          Pembayaran uji coba. Halaman ini hanya ada di komputer pengembang, dan tidak ada uang yang dipindahkan.
        </p>

        <section className="mt-6 rounded-card border border-voyage-soft-border bg-voyage-surface p-6">
          <h1 className="font-heading text-2xl font-extrabold tracking-[-0.035em]">{order.packageName}</h1>
          <p className="mt-4 flex items-baseline justify-between gap-3 border-t border-voyage-soft-border pt-4">
            <span className="text-sm text-voyage-muted-ink">Total</span>
            <span className="font-heading text-2xl font-extrabold tracking-[-0.04em]">
              {formatRupiah(order.amountRupiah)}
            </span>
          </p>

          <form action={settleStandInPayment} className="mt-8 flex flex-col gap-3">
            <input name="reference" type="hidden" value={reference} />
            <button className={cn(buttonVariants({ size: "lg" }), "w-full")} name="outcome" type="submit" value="succeeded">
              Bayar sekarang
            </button>
            <button
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full")}
              name="outcome"
              type="submit"
              value="failed"
            >
              Buat pembayaran gagal
            </button>
            <button
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full")}
              name="outcome"
              type="submit"
              value="expired"
            >
              Buat waktu pembayaran habis
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

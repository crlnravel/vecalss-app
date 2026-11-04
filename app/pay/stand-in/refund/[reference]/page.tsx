import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button-variants";
import { requireAdminSession } from "@/lib/auth/access";
import { getPaymentProvider } from "@/lib/payments/provider";
import { STAND_IN_PROVIDER_ID } from "@/lib/payments/stand-in/provider";
import { formatRupiah } from "@/lib/pricing/schedule";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

import { settleStandInRefund } from "./actions";

export const metadata: Metadata = {
  title: "Pengembalian dana uji coba | Vecalss",
  robots: { follow: false, index: false },
};

export const dynamic = "force-dynamic";

/**
 * The stand-in provider's refund console: where a developer decides what the
 * pretend provider reports for a refund it holds. It exists only while the
 * stand-in is enabled (a local database) and only for a verified admin; anywhere
 * else this route is a 404.
 */
export default async function StandInRefundPage({ params }: { params: Promise<{ reference: string }> }) {
  if (getPaymentProvider()?.id !== STAND_IN_PROVIDER_ID) notFound();
  await requireAdminSession();

  const { reference } = await params;
  const [refund] = await prisma.$queryRaw<Array<{ amountRupiah: number; state: string }>>`
    SELECT amount_rupiah AS "amountRupiah", state FROM stand_in_refunds WHERE reference = ${reference}
  `;
  if (!refund) notFound();

  return (
    <main className="min-h-screen bg-[#eef2f0] px-5 py-16 text-voyage-ink">
      <div className="mx-auto w-full max-w-[480px]">
        <p
          className="rounded-control border border-student-status-attention-border bg-student-status-attention-bg px-4 py-3 text-sm font-semibold leading-6 text-student-status-attention-fg"
          role="note"
        >
          Penyedia uji coba. Halaman ini hanya ada di komputer pengembang, dan tidak ada uang yang dipindahkan.
        </p>

        <section className="mt-6 rounded-card border border-voyage-soft-border bg-voyage-surface p-6">
          <h1 className="font-heading text-2xl font-extrabold tracking-[-0.035em]">Pengembalian dana</h1>
          <p className="mt-4 flex items-baseline justify-between gap-3 border-t border-voyage-soft-border pt-4">
            <span className="text-sm text-voyage-muted-ink">Jumlah</span>
            <span className="font-heading text-2xl font-extrabold tracking-[-0.04em]">{formatRupiah(refund.amountRupiah)}</span>
          </p>

          {refund.state === "pending" ? (
            <form action={settleStandInRefund} className="mt-8 flex flex-col gap-3">
              <input name="reference" type="hidden" value={reference} />
              <button className={cn(buttonVariants({ size: "lg" }), "w-full")} name="outcome" type="submit" value="succeeded">
                Laporkan pengembalian berhasil
              </button>
              <button className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full")} name="outcome" type="submit" value="failed">
                Laporkan pengembalian gagal
              </button>
            </form>
          ) : (
            <p className="mt-8 text-sm leading-6 text-voyage-muted-ink">
              Pengembalian ini sudah {refund.state === "succeeded" ? "dilaporkan berhasil" : "dilaporkan gagal"}.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

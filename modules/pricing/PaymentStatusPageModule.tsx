import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import { Info } from "@/lib/icons";
import { formatRupiah } from "@/lib/pricing/schedule";
import { cn } from "@/lib/utils";
import { MarketingHeader } from "@/modules/home/components/marketing-header";

type PaymentStatus = "expired" | "failed" | "paid" | "pending" | "review";

/** What the buyer received for a paid order. Absent for orders that are not paid. */
type PaymentDelivery = {
  /** Formatted for the reader, for example "4 Desember 2026". */
  validUntilLabel: string | null;
  planLabel: string | null;
  receiptNumber: string | null;
  status: "delivered" | "pending";
};

type PaymentStatusPageModuleProps = {
  amountRupiah: number;
  delivery?: PaymentDelivery | null;
  /** Formatted for the reader, for example "14.35 WIB". */
  expiresAtLabel: string;
  packageName: string;
  payUrl: string | null;
  status: PaymentStatus;
};

const COPY: Record<PaymentStatus, { body: (name: string, amount: string, until: string) => string; title: string }> = {
  expired: {
    body: (name) =>
      `Batas waktu pembayaran untuk ${name} sudah lewat. Kalau kamu belum membayar, mulai lagi dari halaman harga.`,
    title: "Waktu pembayaran habis",
  },
  failed: {
    body: (name) =>
      `Pembayaran untuk ${name} tidak berhasil. Kamu bisa mencoba lagi dari halaman harga.`,
    title: "Pembayaran belum berhasil",
  },
  paid: {
    body: (name, amount) => `Pembayaran ${amount} untuk ${name} sudah kami terima.`,
    title: "Pembayaran diterima",
  },
  pending: {
    body: (name, amount, until) =>
      `Selesaikan pembayaran ${amount} untuk ${name} sebelum ${until}. Halaman ini akan memperbarui dirinya sendiri.`,
    title: "Menunggu pembayaran",
  },
  review: {
    body: (name) =>
      `Pembayaran untuk ${name} masuk setelah batas waktunya, jadi tim Vecalss perlu memeriksanya dulu. Kami akan menghubungimu lewat email.`,
    title: "Pembayaranmu sedang diperiksa",
  },
};

export default function PaymentStatusPageModule({
  amountRupiah,
  delivery = null,
  expiresAtLabel,
  packageName,
  payUrl,
  status,
}: PaymentStatusPageModuleProps) {
  const paidCopy = status === "paid" && delivery
    ? delivery.status === "delivered"
      ? {
          body: `Pembayaran ${formatRupiah(amountRupiah)} untuk ${packageName} sudah kami terima. ${delivery.planLabel ?? "Aksesmu"} aktif sampai ${delivery.validUntilLabel ?? "-"}.${delivery.receiptNumber ? ` Nomor struk: ${delivery.receiptNumber}.` : ""}`,
          title: "Pembayaran diterima, aksesmu aktif",
        }
      : {
          body: `Pembayaran ${formatRupiah(amountRupiah)} untuk ${packageName} sudah kami terima. Aksesmu sedang disiapkan. Kalau belum aktif dalam beberapa menit, hubungi tim Vecalss.`,
          title: "Pembayaran diterima, aksesmu sedang disiapkan",
        }
    : null;
  const copy = paidCopy
    ? { body: () => paidCopy.body, title: paidCopy.title }
    : COPY[status];
  const needsAttention = status === "failed" || status === "expired" || status === "review";

  return (
    <main className="reference-landing min-h-screen overflow-x-clip bg-[#eef2f0] text-[var(--voyage-deep)]">
      {status === "pending" ? <meta content="5" httpEquiv="refresh" /> : null}
      {status === "paid" && delivery?.status === "pending" ? <meta content="10" httpEquiv="refresh" /> : null}
      <MarketingHeader currentPath="/pricing" layout="landing" />

      <div className="mx-auto w-full max-w-[560px] px-5 pb-24 pt-32 md:pt-40">
        <div
          className="rounded-card border border-voyage-soft-border bg-voyage-surface p-6 sm:p-7"
          role="status"
        >
          <h1 className="text-balance font-heading text-3xl font-extrabold leading-tight tracking-[-0.04em] text-voyage-ink">
            {copy.title}
          </h1>
          <p
            className={cn(
              "mt-4 flex items-start gap-2.5 text-sm leading-7",
              needsAttention ? "text-student-status-attention-fg" : "text-voyage-deep/78",
            )}
          >
            {needsAttention ? <Info aria-hidden="true" className="mt-1 size-4 shrink-0" /> : null}
            {copy.body(packageName, formatRupiah(amountRupiah), expiresAtLabel)}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {status === "pending" && payUrl ? (
              <a className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")} href={payUrl}>
                Lanjut membayar
              </a>
            ) : null}
            {status === "paid" ? (
              <Link className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")} href="/dashboard">
                Ke dashboard
              </Link>
            ) : null}
            {status === "failed" || status === "expired" ? (
              <Link className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")} href="/pricing">
                Kembali ke halaman harga
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

export type { PaymentDelivery, PaymentStatus };

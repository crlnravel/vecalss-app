import Link from "next/link";

import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { buttonVariants } from "@/components/ui/button-variants";
import { Checkbox } from "@/components/ui/checkbox";
import { fieldLabelClassName } from "@/components/ui/field-constants";
import { Input } from "@/components/ui/input";
import { Info } from "@/lib/icons";
import {
  formatRupiah,
  getPlanPrice,
  getPlanValidityLabel,
  type PricingPlanId,
  type PricingScheduleEntry,
} from "@/lib/pricing/schedule";
import { cn } from "@/lib/utils";
import { MarketingHeader } from "@/modules/home/components/marketing-header";

import { PLAN_COPY } from "./plan-copy";

type CheckoutNotice =
  | "checkout-blocked"
  | "checkout-changed"
  | "checkout-daily-limit"
  | "checkout-expired"
  | "checkout-full-access"
  | "checkout-open-payment"
  | "checkout-paused"
  | "checkout-terms"
  | "checkout-too-many"
  | "checkout-unavailable";

const NOTICE_COPY: Record<CheckoutNotice, string> = {
  "checkout-blocked":
    "Pembelian belum bisa kami proses saat ini. Kalau kamu merasa ini keliru, hubungi tim Vecalss supaya kami bisa membantu memeriksanya.",
  "checkout-changed":
    "Pilihan di halaman ini sempat berubah. Periksa lagi paket dan kode referralmu, lalu lanjut ke pembayaran.",
  "checkout-daily-limit":
    "Kamu sudah mencapai batas pembelian untuk hari ini. Coba lagi besok.",
  "checkout-expired":
    "Sudah cukup lama sejak halaman ini dibuka, jadi harganya bisa saja sudah berubah. Periksa lagi totalnya, lalu lanjut ke pembayaran.",
  "checkout-full-access":
    "Full Access-mu masih berjalan dan sudah mencakup isi Monthly Access, jadi paket bulanan belum perlu dibeli. Setelah Full Access berakhir, kamu bisa memilih paket lagi di sini.",
  "checkout-open-payment":
    "Kamu masih punya pembayaran yang belum selesai. Selesaikan dulu pembayaran itu, atau tunggu sampai waktunya habis, lalu coba lagi.",
  "checkout-paused":
    "Pembelian paket sedang dijeda sementara. Coba lagi beberapa saat lagi, atau hubungi tim Vecalss kalau butuh bantuan.",
  "checkout-terms":
    "Centang persetujuan Syarat Pembelian dulu, lalu lanjut ke pembayaran.",
  "checkout-too-many":
    "Kamu sudah beberapa kali memulai pembayaran dalam waktu singkat. Tunggu sebentar, lalu coba lagi.",
  "checkout-unavailable":
    "Pembayaran belum bisa dibuka saat ini. Coba lagi nanti atau hubungi tim Vecalss.",
};
type ReferralStatus = "active" | "invalid" | "none" | "unchecked";

type PricingCheckoutPageModuleProps = {
  checkoutReady: boolean;
  entry: PricingScheduleEntry;
  intentKey: string;
  notice: CheckoutNotice | null;
  /** Where to resume an unfinished payment, shown with the open-payment notice. */
  openPaymentHref: string | null;
  plan: PricingPlanId;
  referralCode: string;
  referralStatus: ReferralStatus;
  /** Shown with the blocked notice. */
  supportContact: { label: string; url: string };
  /** What the buyer's tick stands for; sent with the form and checked again on the server. */
  termsVersion: string;
};

function ReferralField({
  referralCode,
  status,
}: {
  referralCode: string;
  status: ReferralStatus;
}) {
  const statusId = "referral-status";
  const message =
    status === "active"
      ? `Kode ${referralCode} aktif. Pembelian ini akan tercatat atas affiliator pemilik kode.`
      : status === "invalid"
        ? `Kode ${referralCode} tidak ditemukan atau sudah tidak aktif. Periksa lagi, atau kosongkan kolom ini.`
        : null;

  return (
    <div>
      <label className={fieldLabelClassName} htmlFor="referral-code">
        Kode referral (opsional)
      </label>
      <Input
        aria-describedby={message ? statusId : undefined}
        aria-invalid={status === "invalid" ? true : undefined}
        autoCapitalize="characters"
        autoComplete="off"
        defaultValue={referralCode}
        id="referral-code"
        maxLength={40}
        name="ref"
        placeholder="Contoh: SALSA2027"
        spellCheck={false}
        type="text"
      />
      <p
        aria-live="polite"
        className={cn(
          "mt-2 text-xs leading-5",
          status === "invalid"
            ? "text-student-status-danger-fg"
            : "text-voyage-muted-ink",
        )}
        id={statusId}
      >
        {message}
      </p>
    </div>
  );
}

export default function PricingCheckoutPageModule({
  checkoutReady,
  entry,
  intentKey,
  notice,
  openPaymentHref,
  plan,
  referralCode,
  referralStatus,
  supportContact,
  termsVersion,
}: PricingCheckoutPageModuleProps) {
  const copy = PLAN_COPY[plan];

  return (
    <main className="reference-landing min-h-screen overflow-x-clip bg-[#eef2f0] text-[var(--voyage-deep)]">
      <MarketingHeader currentPath="/pricing" layout="landing" />

      <div className="mx-auto w-full max-w-[560px] px-5 pb-24 pt-32 md:pt-40">
        <header className="text-center">
          <h1 className="text-balance font-heading text-4xl font-extrabold leading-tight tracking-[-0.04em] text-voyage-ink md:text-5xl">
            Checkout
          </h1>
          <p className="mx-auto mt-4 max-w-[44ch] text-pretty text-sm leading-7 text-voyage-deep/78 md:text-base">
            Periksa paketmu, lalu lanjut ke pembayaran.
          </p>
        </header>

        {notice ? (
          <p
            className="mt-8 flex items-start gap-2.5 text-sm leading-6 text-student-status-attention-fg"
            role="status"
          >
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {NOTICE_COPY[notice]}
              {notice === "checkout-blocked" ? (
                <>
                  {" "}
                  <a
                    className="font-semibold text-voyage-deep underline underline-offset-4"
                    href={supportContact.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {supportContact.label}
                  </a>
                </>
              ) : null}
              {notice === "checkout-open-payment" && openPaymentHref ? (
                <>
                  {" "}
                  <Link
                    className="font-semibold text-voyage-deep underline underline-offset-4"
                    href={openPaymentHref}
                  >
                    Lihat pembayaranmu
                  </Link>
                </>
              ) : null}
            </span>
          </p>
        ) : null}

        <form
          action="/pricing/checkout/pay"
          className="mt-10 rounded-card border border-voyage-soft-border bg-voyage-surface p-6 sm:p-7"
          method="post"
        >
          <input name="plan" type="hidden" value={plan} />
          <input name="key" type="hidden" value={intentKey} />

          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-heading text-xl font-extrabold tracking-[-0.035em] text-voyage-ink">
                {copy.name}
              </h2>
              <p className="mt-1 text-sm font-semibold text-voyage-ink">
                {getPlanValidityLabel(entry, plan)}
              </p>
            </div>
            <Link
              className="shrink-0 text-sm font-semibold text-voyage-deep underline-offset-4 hover:underline"
              href="/pricing"
            >
              Ganti paket
            </Link>
          </div>

          <p className="mt-6 flex items-baseline justify-between gap-3 border-t border-voyage-soft-border pt-6">
            <span className="text-sm text-voyage-muted-ink">Total</span>
            <span className="font-heading text-3xl font-extrabold tracking-[-0.04em] text-voyage-deep">
              {formatRupiah(getPlanPrice(entry, plan))}
            </span>
          </p>

          <div className="mt-6">
            <ReferralField referralCode={referralCode} status={referralStatus} />
          </div>

          <label
            className={cn(REFERENCE_CONTROL_CLASS_NAMES.choice, "mt-6 h-auto items-start py-3")}
            htmlFor="terms-agree"
          >
            <Checkbox
              className="mt-0.5"
              id="terms-agree"
              name="terms"
              required
              value={termsVersion}
            />
            <span className="text-sm leading-6 text-voyage-ink">
              Aku sudah membaca dan setuju dengan{" "}
              <Link
                className="font-semibold text-voyage-deep underline underline-offset-4"
                href="/syarat-pembelian"
                target="_blank"
              >
                Syarat Pembelian
              </Link>
              .
            </span>
          </label>

          <button
            className={cn(buttonVariants({ size: "lg" }), "mt-6 w-full")}
            disabled={!checkoutReady}
            type="submit"
          >
            Lanjut ke pembayaran
          </button>
        </form>
      </div>
    </main>
  );
}

export type { CheckoutNotice, ReferralStatus };

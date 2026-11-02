import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
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
  | "checkout-changed"
  | "checkout-expired"
  | "checkout-paused"
  | "checkout-unavailable";

const NOTICE_COPY: Record<CheckoutNotice, string> = {
  "checkout-changed":
    "Pilihan di halaman ini sempat berubah. Periksa lagi paket dan kode referralmu, lalu lanjut ke pembayaran.",
  "checkout-expired":
    "Sudah cukup lama sejak halaman ini dibuka, jadi harganya bisa saja sudah berubah. Periksa lagi totalnya, lalu lanjut ke pembayaran.",
  "checkout-paused":
    "Pembelian paket sedang dijeda sementara. Coba lagi beberapa saat lagi, atau hubungi tim Vecalss kalau butuh bantuan.",
  "checkout-unavailable":
    "Pembayaran belum bisa dibuka saat ini. Coba lagi nanti atau hubungi tim Vecalss.",
};
type ReferralStatus = "active" | "invalid" | "none" | "unchecked";

type PricingCheckoutPageModuleProps = {
  checkoutReady: boolean;
  entry: PricingScheduleEntry;
  intentKey: string;
  notice: CheckoutNotice | null;
  plan: PricingPlanId;
  referralCode: string;
  referralStatus: ReferralStatus;
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
  plan,
  referralCode,
  referralStatus,
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
            {NOTICE_COPY[notice]}
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

          <button
            className={cn(buttonVariants({ size: "lg" }), "mt-8 w-full")}
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

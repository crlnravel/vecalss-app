import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Check, Info } from "@/lib/icons";
import {
  formatRupiah,
  getPlanPrice,
  getPlanValidityLabel,
  type PricingPlanId,
  type PricingResolution,
  type PricingScheduleEntry,
} from "@/lib/pricing/schedule";
import { cn } from "@/lib/utils";
import { ActionButtonLink } from "@/modules/home/components/home-primitives";
import { MarketingHeader } from "@/modules/home/components/marketing-header";

import { PLAN_COPY } from "./plan-copy";

type PricingPageModuleProps = {
  pricing: PricingResolution;
  referralCode: string;
  studentOnlyNotice: boolean;
};

function buildCheckoutHref(plan: PricingPlanId, referralCode: string) {
  const params = new URLSearchParams(referralCode ? { plan, ref: referralCode } : { plan });
  return `/pricing/checkout?${params}`;
}

function PlanCard({
  entry,
  plan,
  referralCode,
}: {
  entry: PricingScheduleEntry;
  plan: PricingPlanId;
  referralCode: string;
}) {
  const copy = PLAN_COPY[plan];
  const isRecommended = plan === "full";
  const headingId = `plan-${plan}-heading`;

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col rounded-card border bg-voyage-surface p-6 sm:p-7",
        isRecommended
          ? "border-voyage-deep shadow-[0_0_0_1px_var(--voyage-deep)]"
          : "border-voyage-soft-border",
      )}
    >
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2
          className="font-heading text-xl font-extrabold tracking-[-0.035em] text-voyage-ink"
          id={headingId}
        >
          {copy.name}
        </h2>
        {isRecommended ? (
          <Badge size="sm" tone="success">
            Direkomendasikan
          </Badge>
        ) : null}
      </div>

      <p className="mt-2 text-sm leading-6 text-voyage-muted-ink">
        {copy.summary}
      </p>

      <p className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-heading text-4xl font-extrabold tracking-[-0.04em] text-voyage-deep">
          {formatRupiah(getPlanPrice(entry, plan))}
        </span>
        <span className="text-sm text-voyage-muted-ink">{copy.priceNote}</span>
      </p>

      <ul className="mt-6 grid gap-3 text-sm leading-6 text-voyage-ink">
        <li className="flex items-start gap-2.5">
          <Check
            aria-hidden="true"
            className="mt-1 size-4 shrink-0 text-voyage-leaf"
            weight="bold"
          />
          <span className="font-semibold">
            {getPlanValidityLabel(entry, plan)}
          </span>
        </li>
        {plan === "full" && entry.fullTarget === "mandiri" ? (
          <li className="flex items-start gap-2.5">
            <Check
              aria-hidden="true"
              className="mt-1 size-4 shrink-0 text-voyage-leaf"
              weight="bold"
            />
            <span>
              Mulai April, Full Access berlaku sampai Ujian Mandiri, bukan UTBK-SNBT.
            </span>
          </li>
        ) : null}
      </ul>

      <ActionButtonLink
        className="mt-8 w-full"
        href={buildCheckoutHref(plan, referralCode)}
        variant={isRecommended ? "default" : "outline"}
      >
        Pilih {copy.name}
      </ActionButtonLink>
    </article>
  );
}

export default function PricingPageModule({
  pricing,
  referralCode,
  studentOnlyNotice,
}: PricingPageModuleProps) {
  const { entry } = pricing;

  return (
    <main className="reference-landing min-h-screen overflow-x-clip bg-[#eef2f0] text-[var(--voyage-deep)]">
      <MarketingHeader currentPath="/pricing" layout="landing" />

      <div className="mx-auto w-full max-w-[1040px] px-5 pb-24 pt-32 md:px-10 md:pt-40">
        <header className="mx-auto max-w-[720px] text-center">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-voyage-deep/78">
            Harga dan paket
          </p>
          <h1 className="mt-4 text-balance font-heading text-4xl font-extrabold leading-tight tracking-[-0.04em] text-voyage-ink md:text-5xl">
            Pilih akses belajar yang cocok buatmu
          </h1>
          <p className="mx-auto mt-5 max-w-[56ch] text-pretty text-sm leading-7 text-voyage-deep/78 md:text-base">
            Bayar sekali untuk satu periode akses, tanpa perpanjangan otomatis.
            Harga mengikuti bulan kamu membeli.
          </p>
        </header>

        {studentOnlyNotice ? (
          <p
            className="mx-auto mt-8 flex max-w-[620px] items-start gap-2.5 text-sm leading-6 text-student-status-attention-fg"
            role="status"
          >
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Pembelian paket hanya tersedia untuk akun Voyager.
          </p>
        ) : null}

        {entry ? (
          <>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              <PlanCard entry={entry} plan="monthly" referralCode={referralCode} />
              <PlanCard entry={entry} plan="full" referralCode={referralCode} />
            </div>
            <p className="mt-8 text-center text-sm leading-7 text-voyage-deep/78">
              Dengan membeli, kamu setuju dengan{" "}
              <Link
                className="font-semibold text-voyage-deep underline underline-offset-4"
                href="/syarat-pembelian"
              >
                Syarat Pembelian
              </Link>
              .
            </p>
          </>
        ) : (
          <section
            aria-label="Harga belum tersedia"
            className="mx-auto mt-12 max-w-[560px] text-center"
          >
            <p className="text-sm leading-7 text-voyage-deep/78">
              Harga untuk bulan ini belum tersedia. Hubungi tim Vecalss untuk
              info paket terbaru.
            </p>
            <ActionButtonLink className="mt-6" href="/#contact">
              Lihat pilihan kontak
            </ActionButtonLink>
          </section>
        )}
      </div>
    </main>
  );
}

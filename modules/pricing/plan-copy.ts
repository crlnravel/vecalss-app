import type { PricingPlanId } from "@/lib/pricing/schedule";

const PLAN_COPY: Record<
  PricingPlanId,
  { name: string; priceNote: string; summary: string }
> = {
  full: {
    name: "Full Access",
    priceNote: "sekali bayar",
    summary: "Satu kali bayar untuk belajar sampai ujian target.",
  },
  monthly: {
    name: "Monthly Access",
    priceNote: "sekali bayar untuk 1 bulan",
    summary: "Akses per bulan. Tidak diperpanjang otomatis.",
  },
};

export { PLAN_COPY };

import type { Metadata } from "next";

import { resolvePricing } from "@/lib/pricing/schedule";
import PricingPageModule from "@/modules/pricing/PricingPageModule";

export const metadata: Metadata = {
  title: "Harga | Vecalss",
  description:
    "Pilih Monthly Access atau Full Access Vecalss. Harga mengikuti bulan pembelian dan masa aksesnya jelas.",
};

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  return (
    <PricingPageModule
      pricing={resolvePricing()}
      referralCode={(firstValue(params.ref)?.trim() ?? "").slice(0, 40)}
      studentOnlyNotice={firstValue(params.notice) === "student-only"}
    />
  );
}

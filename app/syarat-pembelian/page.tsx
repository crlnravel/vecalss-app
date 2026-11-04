import type { Metadata } from "next";

import { getSupportContact } from "@/lib/config";
import { PURCHASE_TERMS } from "@/lib/fulfillment/terms";
import PurchaseTermsPageModule from "@/modules/pricing/PurchaseTermsPageModule";

export const metadata: Metadata = {
  title: "Syarat Pembelian | Vecalss",
  description: "Aturan pembelian paket belajar Vecalss dalam bahasa yang mudah dipahami.",
};

export default function PurchaseTermsPage() {
  return <PurchaseTermsPageModule supportContact={getSupportContact()} terms={PURCHASE_TERMS} />;
}

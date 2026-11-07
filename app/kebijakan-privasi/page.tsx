import type { Metadata } from "next";

import { getPrivacyPolicy } from "@/lib/legal";
import { LegalPageModule } from "@/modules/legal/LegalPageModule";

export const metadata: Metadata = {
  title: "Kebijakan Privasi | PTN Pro",
  description: "Data apa yang PTN Pro kumpulkan, untuk apa, berapa lama disimpan, dan hakmu atas data itu.",
};

export default function PrivacyPolicyPage() {
  return <LegalPageModule currentHref="/kebijakan-privasi" document={getPrivacyPolicy()} />;
}

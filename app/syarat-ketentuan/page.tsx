import type { Metadata } from "next";

import { getTermsOfService } from "@/lib/legal";
import { LegalPageModule } from "@/modules/legal/LegalPageModule";

export const metadata: Metadata = {
  title: "Syarat dan Ketentuan | PTN Pro",
  description: "Aturan memakai akun PTN Pro: akun, penggunaan, hak atas Materi, Vera, dan penyelesaian sengketa.",
};

export default function TermsOfServicePage() {
  return <LegalPageModule currentHref="/syarat-ketentuan" document={getTermsOfService()} />;
}

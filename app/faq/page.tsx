import type { Metadata } from "next";

import FaqPageModule from "@/modules/faq/FaqPageModule";

export const metadata: Metadata = {
  title: "FAQ Vecalss | Pertanyaan Umum",
  description:
    "Temukan informasi tentang program Vecalss, Vera AI, Tryout, dan cara mulai belajar.",
};

export default function FaqPage() {
  return <FaqPageModule />;
}

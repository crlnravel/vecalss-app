import type { Metadata } from "next";

import TopAlumniPageModule from "@/modules/alumni/TopAlumniPageModule";

export const metadata: Metadata = {
  title: "Contoh profil alumni | PTN Pro",
  description:
    "Lihat contoh tampilan profil alumni PTN Pro. Data pada halaman ini belum mencerminkan alumni PTN Pro yang sebenarnya.",
};

export default async function TopAlumniPage() {
  return <TopAlumniPageModule />;
}

import type { Metadata } from "next";

import TopAlumniPageModule from "@/modules/alumni/TopAlumniPageModule";

export const metadata: Metadata = {
  title: "Contoh profil alumni | Vecalss",
  description:
    "Lihat contoh tampilan profil alumni Vecalss. Data pada halaman ini belum mencerminkan alumni Vecalss yang sebenarnya.",
};

export default async function TopAlumniPage() {
  return <TopAlumniPageModule />;
}

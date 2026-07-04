import type { Metadata } from "next";

import TopAlumniPageModule from "@/modules/alumni/TopAlumniPageModule";

export const metadata: Metadata = {
  title: "Top 20 Alumni | Vecalss LMS",
  description:
    "Explore the top 20 Vecalss alumni and the universities they were accepted into.",
};

export default async function TopAlumniPage() {
  return <TopAlumniPageModule />;
}

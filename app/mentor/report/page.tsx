import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { MentorReportPageModule } from "@/modules/mentor/MentorReportPageModule";

export const metadata: Metadata = {
  title: "Laporan Kapten | Vecalss LMS",
};

export default async function MentorReportPage() {
  const session = await requireTutorSession();

  return <MentorReportPageModule session={session} />;
}

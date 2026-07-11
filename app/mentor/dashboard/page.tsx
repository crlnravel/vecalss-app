import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { MentorDashboardPageModule } from "@/modules/mentor/MentorDashboardPageModule";

export const metadata: Metadata = {
  title: "Dashboard Kapten | Vecalss LMS",
};

export default async function MentorDashboardPage() {
  const session = await requireTutorSession();

  return <MentorDashboardPageModule session={session} />;
}

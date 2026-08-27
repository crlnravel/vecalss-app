import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorDashboardProjection } from "@/lib/mentor/dashboard-repository";
import { MentorDashboardPageModule } from "@/modules/mentor/MentorDashboardPageModule";

export const metadata: Metadata = {
  title: "Dashboard Kapten | Vecalss LMS",
};

export default async function MentorDashboardPage() {
  const session = await requireTutorSession();
  const dashboard = await getMentorDashboardProjection(session.user.id);

  return <MentorDashboardPageModule dashboard={dashboard} session={session} />;
}

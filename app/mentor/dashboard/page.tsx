import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorDashboardProjection } from "@/lib/mentor/dashboard-repository";
import { listOpenTryoutResultReviewAlerts } from "@/lib/notifications/tryout-result-review";
import { MentorDashboardPageModule } from "@/modules/mentor/MentorDashboardPageModule";

export const metadata: Metadata = {
  title: "Dashboard Kapten | PTN Pro LMS",
};

export default async function MentorDashboardPage() {
  const session = await requireTutorSession();
  const [dashboard, resultReviews] = await Promise.all([
    getMentorDashboardProjection(session.user.id),
    // An alert list must never take the dashboard down.
    listOpenTryoutResultReviewAlerts(session.user.id).catch((error) => {
      console.error("Tryout result review alerts failed", error);
      return [];
    }),
  ]);

  return <MentorDashboardPageModule dashboard={dashboard} resultReviews={resultReviews} session={session} />;
}

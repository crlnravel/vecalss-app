import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { PAID_USE_RETRY_MESSAGE, studentMayUsePaidSurfaces } from "@/lib/billing/enforcement";
import { getAccessState } from "@/lib/billing/service";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { PaidAccessRequiredPageModule } from "@/modules/student/PaidAccessRequiredPageModule";

export const metadata: Metadata = {
  title: "Paket belajar | PTN Pro LMS",
  robots: { follow: false, index: false },
};

export const dynamic = "force-dynamic";

/** Where every paid student surface sends a student whose package does not cover it. */
export default async function PaidAccessRequiredPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const session = await requireStudentSession({ allowUnpaid: true });
  const { notice } = await searchParams;

  if (notice === "try-again") {
    return (
      <PaidAccessRequiredPageModule
        notificationFeed={{ items: [], unreadCount: 0 }}
        retryMessage={PAID_USE_RETRY_MESSAGE}
        session={session}
        status="none"
      />
    );
  }

  // Anyone who may use the surfaces (including everyone while enforcement is off) has nothing to see here.
  if (await studentMayUsePaidSurfaces(session.user.id)) redirect("/dashboard");

  const [state, notificationFeed] = await Promise.all([
    getAccessState(session.user.id),
    getStudentNotificationFeed({ userId: session.user.id }),
  ]);

  return (
    <PaidAccessRequiredPageModule
      notificationFeed={notificationFeed}
      session={session}
      status={state.status === "active" ? "none" : state.status}
    />
  );
}

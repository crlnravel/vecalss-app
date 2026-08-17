import { Suspense } from "react";

import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { VeraAiPageModule } from "@/modules/vera-ai/VeraAiPageModule";

export default async function VeraAiPage() {
  const session = await requireStudentSession();
  const notificationFeed = await getStudentNotificationFeed({ userId: session.user.id });

  return (
    <Suspense fallback={<div className="min-h-svh bg-primary-50" />}>
      <VeraAiPageModule notificationFeed={notificationFeed} session={session} />
    </Suspense>
  );
}

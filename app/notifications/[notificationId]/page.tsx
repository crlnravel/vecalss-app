import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import {
  getAndMarkStudentNotificationDetail,
  getStudentNotificationFeed,
} from "@/lib/notifications/service";
import { NotificationDetailPageModule } from "@/modules/student/NotificationDetailPageModule";

export const dynamic = "force-dynamic";

export default async function NotificationDetailPage({
  params,
}: {
  params: Promise<{ notificationId: string }>;
}) {
  const session = await requireStudentSession();
  const { notificationId } = await params;
  const notification = await getAndMarkStudentNotificationDetail({
    notificationId,
    userId: session.user.id,
  });

  if (!notification) {
    notFound();
  }

  const feed = await getStudentNotificationFeed({ userId: session.user.id, limit: 20 });

  return (
    <NotificationDetailPageModule
      notification={notification}
      notificationItems={feed.items}
      notificationUnreadCount={feed.unreadCount}
      session={session}
    />
  );
}

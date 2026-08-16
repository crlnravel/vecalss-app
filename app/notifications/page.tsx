import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { NotificationsPageModule } from "@/modules/student/NotificationsPageModule";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await requireStudentSession();
  const { items, unreadCount } = await getStudentNotificationFeed({ userId: session.user.id });

  return <NotificationsPageModule items={items} session={session} unreadCount={unreadCount} />;
}

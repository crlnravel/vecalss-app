import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import type { NavigationQueryValue } from "@/lib/navigation/canonical-context";
import { getAndMarkStudentNotificationDetail, getStudentNotificationFeed } from "@/lib/notifications/service";
import { NotificationsPageModule } from "@/modules/student/NotificationsPageModule";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Notifikasi | Vecalss LMS",
};

const NOTIFICATION_PAGE_SIZE = 10;

function readPage(value: NavigationQueryValue) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsedPage = Number.parseInt(rawValue ?? "", 10);

  return Number.isFinite(parsedPage) ? parsedPage : 1;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, NavigationQueryValue>>;
}) {
  const session = await requireStudentSession();
  const query = await searchParams;
  const notificationId = Array.isArray(query.notification) ? query.notification[0] : query.notification;
  const notification = notificationId
    ? await getAndMarkStudentNotificationDetail({ notificationId, userId: session.user.id })
    : null;

  if (notificationId && !notification) {
    notFound();
  }

  const feed = await getStudentNotificationFeed({
    limit: NOTIFICATION_PAGE_SIZE,
    page: readPage(query.page),
    userId: session.user.id,
  });

  return <NotificationsPageModule items={feed.items} notification={notification} page={feed.page} pageCount={feed.pageCount} session={session} unreadCount={feed.unreadCount} />;
}

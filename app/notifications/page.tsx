import { requireStudentSession } from "@/lib/auth/access";
import { NotificationsPageModule } from "@/modules/student/NotificationsPageModule";
import { studentNotificationItems } from "@/modules/student/notification-data";

export default async function NotificationsPage() {
  const session = await requireStudentSession();

  return (
    <NotificationsPageModule
      items={studentNotificationItems}
      session={session}
    />
  );
}

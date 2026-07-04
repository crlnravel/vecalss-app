import { requireStudentSession } from "@/lib/auth/access";
import { NotificationsPageModule } from "@/modules/student/NotificationsPageModule";

export default async function NotificationsPage() {
  const session = await requireStudentSession();

  return <NotificationsPageModule session={session} />;
}

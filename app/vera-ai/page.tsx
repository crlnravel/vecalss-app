import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { getConversationWithMessages, getLatestConversationId } from "@/lib/vera/conversations";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";
import { VeraPageModule } from "@/modules/vera/VeraPageModule";

export default async function VeraAiPage() {
  const session = await requireStudentSession();
  const [notificationFeed, latestConversationId] = await Promise.all([
    getStudentNotificationFeed({ userId: session.user.id }),
    getLatestConversationId(session.user.id),
  ]);
  const conversation = latestConversationId
    ? await getConversationWithMessages(session.user.id, latestConversationId)
    : null;

  return (
    <CourseWorkspaceShell activeLabel="Vera AI" breadcrumbLabel="Vera AI" notificationFeed={notificationFeed} session={session} showSearch={false}>
      <VeraPageModule conversationId={conversation?.id ?? null} initialMessages={conversation?.messages ?? []} />
    </CourseWorkspaceShell>
  );
}

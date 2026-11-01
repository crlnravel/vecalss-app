// KaTeX styles load only with the Vera page, which is where math answers appear.
import "katex/dist/katex.min.css";

import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { getConversationWithMessages, getLatestConversationId } from "@/lib/vera/conversations";
import { getVeraUsageSnapshot } from "@/lib/vera/ledger";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";
import { VeraPageModule } from "@/modules/vera/VeraPageModule";

export default async function VeraAiPage() {
  const session = await requireStudentSession();
  const studentId = session.user.id;
  const [notificationFeed, latestConversationId, initialUsage] = await Promise.all([
    getStudentNotificationFeed({ userId: studentId }),
    getLatestConversationId(studentId),
    getVeraUsageSnapshot({ studentId }),
  ]);
  const conversation = latestConversationId ? await getConversationWithMessages(studentId, latestConversationId) : null;

  return (
    <CourseWorkspaceShell activeLabel="Vera AI" breadcrumbLabel="Vera AI" notificationFeed={notificationFeed} session={session} showSearch={false}>
      <VeraPageModule
        conversationId={conversation?.id ?? null}
        initialMessages={conversation?.messages ?? []}
        initialUsage={initialUsage}
        studentId={studentId}
      />
    </CourseWorkspaceShell>
  );
}

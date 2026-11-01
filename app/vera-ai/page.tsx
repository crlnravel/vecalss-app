// KaTeX styles load only with the Vera page, which is where math answers appear.
import "katex/dist/katex.min.css";

import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { getConversationWithMessages, getLatestConversationId, listSessions } from "@/lib/vera/conversations";
import { getVeraUsageSnapshot } from "@/lib/vera/ledger";
import { isUuid } from "@/lib/vera/sources/types";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";
import { VeraPageModule } from "@/modules/vera/VeraPageModule";

/**
 * `?c=<id>` opens that session, `?c=new` opens an empty one, and no valid parameter opens the latest session.
 */
export default async function VeraAiPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const [session, { c }] = await Promise.all([requireStudentSession(), searchParams]);
  const studentId = session.user.id;
  const explicit = c === "new" ? "new" : c && isUuid(c) ? c : undefined;
  const [notificationFeed, initialUsage, initialSessions, latestConversationId] = await Promise.all([
    getStudentNotificationFeed({ userId: studentId }),
    getVeraUsageSnapshot({ studentId }),
    listSessions({ studentId, archived: false }),
    explicit === undefined ? getLatestConversationId(studentId) : Promise.resolve(null),
  ]);
  const conversationId = explicit === "new" ? null : (explicit ?? latestConversationId);
  const conversation = conversationId ? await getConversationWithMessages(studentId, conversationId) : null;

  return (
    <CourseWorkspaceShell activeLabel="Vera AI" breadcrumbLabel="Vera AI" notificationFeed={notificationFeed} session={session} showSearch={false}>
      <VeraPageModule
        // A new key remounts the chat, so switching sessions starts from that session's own messages.
        key={conversation?.id ?? "new"}
        conversationId={conversation?.id ?? null}
        initialMessages={conversation?.messages ?? []}
        initialSessions={initialSessions}
        initialUsage={initialUsage}
        studentId={studentId}
      />
    </CourseWorkspaceShell>
  );
}

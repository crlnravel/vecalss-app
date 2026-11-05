// KaTeX styles load only with the Vera page, which is where math answers appear.
import "katex/dist/katex.min.css";

import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { getConversationWithMessages, getLatestConversationId, listSessions } from "@/lib/vera/conversations";
import { getVeraUsageSnapshot } from "@/lib/vera/ledger";
import { isUuid } from "@/lib/vera/sources/types";
import { getStudioDocument, listStudioDocuments } from "@/lib/vera/studio-documents";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";
import { VeraPageModule } from "@/modules/vera/VeraPageModule";

/**
 * `?c=<id>` opens that session, `?c=new` opens an empty one, and no valid parameter opens the latest session.
 * `?c=new&n=<nonce>` opens a new session even when the page already shows one. "Sesi baru" adds the nonce.
 * `?tab=studio&doc=<id>` opens the Studio tab with that document open.
 */
export default async function VeraAiPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; tab?: string; doc?: string; n?: string }>;
}) {
  const [session, { c, tab, doc, n }] = await Promise.all([requireStudentSession(), searchParams]);
  const studentId = session.user.id;
  const nonce = n && /^\d{1,16}$/u.test(n) ? n : "";
  const explicit = c === "new" ? "new" : c && isUuid(c) ? c : undefined;
  const initialTab = tab === "studio" ? "studio" : "chat";
  const [notificationFeed, initialUsage, initialSessions, latestConversationId, initialStudioDocs, initialStudioDocument] =
    await Promise.all([
      getStudentNotificationFeed({ userId: studentId }),
      getVeraUsageSnapshot({ studentId }),
      listSessions({ studentId, archived: false }),
      explicit === undefined ? getLatestConversationId(studentId) : Promise.resolve(null),
      listStudioDocuments({ studentId }),
      initialTab === "studio" && doc && isUuid(doc) ? getStudioDocument({ studentId, id: doc }) : Promise.resolve(null),
    ]);
  const conversationId = explicit === "new" ? null : (explicit ?? latestConversationId);
  const conversation = conversationId ? await getConversationWithMessages(studentId, conversationId) : null;

  return (
    <CourseWorkspaceShell activeLabel="Vera AI" breadcrumbLabel="Vera AI" notificationFeed={notificationFeed} session={session} showSearch={false}>
      <VeraPageModule
        // A new key remounts the page when the session, the tab, the open document or the nonce changes, so each starts from its own state.
        key={`${conversation?.id ?? "new"}:${initialTab}:${initialStudioDocument?.id ?? ""}:${nonce}`}
        conversationId={conversation?.id ?? null}
        initialMessages={conversation?.messages ?? []}
        initialSessions={initialSessions}
        initialStudioDocs={initialStudioDocs}
        initialStudioDocument={initialStudioDocument}
        initialTab={initialTab}
        initialUsage={initialUsage}
        studentId={studentId}
      />
    </CourseWorkspaceShell>
  );
}

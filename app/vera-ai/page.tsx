// KaTeX styles load only with the Vera page, which is where math answers appear.
import "katex/dist/katex.min.css";

import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { getConversationWithMessages, listSessions } from "@/lib/vera/conversations";
import { getVeraUsageSnapshot } from "@/lib/vera/ledger";
import { isUuid } from "@/lib/vera/sources/types";
import { getStudioDocument } from "@/lib/vera/studio-documents";
import { VeraPageModule } from "@/modules/vera/VeraPageModule";

/**
 * `?c=<id>` opens that session's chat, `?c=new` opens an empty chat, and no valid parameter opens home. Home never opens the latest session.
 * `?c=new&n=<nonce>` opens a new session even when the page already shows one. "Sesi baru" adds the nonce.
 * `?tab=studio&doc=<id>` opens home with that saved document's dialog.
 */
export default async function VeraAiPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; tab?: string; doc?: string; n?: string }>;
}) {
  const [session, query] = await Promise.all([requireStudentSession(), searchParams]);
  const studentId = session.user.id;
  const { c, tab, doc, n } = query;
  const nonce = n && /^\d{1,16}$/u.test(n) ? n : "";
  const explicit = c === "new" ? "new" : c && isUuid(c) ? c : undefined;
  const documentId = tab === "studio" && doc && isUuid(doc) ? doc : null;
  const firstName = session.user.fullName?.trim().split(/\s+/)[0] || null;
  const [notificationFeed, initialUsage, initialSessions, initialStudioDocument] = await Promise.all([
    getStudentNotificationFeed({ userId: studentId }),
    getVeraUsageSnapshot({ studentId }),
    listSessions({ studentId, archived: false }),
    documentId ? getStudioDocument({ studentId, id: documentId }) : Promise.resolve(null),
  ]);
  const conversation = explicit && explicit !== "new" ? await getConversationWithMessages(studentId, explicit) : null;

  return (
    <main className="student-page-canvas flex h-dvh min-h-0 flex-col overflow-hidden">
      <VeraPageModule
        // A new key remounts the page when the session, the open document or the nonce changes, so each starts from its own state.
        key={`${conversation?.id ?? "new"}:${initialStudioDocument?.id ?? ""}:${nonce}`}
        conversationId={conversation?.id ?? null}
        firstName={firstName}
        initialMessages={conversation?.messages ?? []}
        initialSessions={initialSessions}
        initialStudioDocument={initialStudioDocument}
        initialUsage={initialUsage}
        notificationFeed={notificationFeed}
        session={session}
        startInChat={explicit !== undefined}
        studentId={studentId}
      />
    </main>
  );
}

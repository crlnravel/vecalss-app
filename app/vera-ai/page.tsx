// KaTeX styles load only with the Vera page, which is where math answers appear.
import "katex/dist/katex.min.css";

import { requireStudentSession } from "@/lib/auth/access";
import { buildStudentReturnHref, parseStudentContext } from "@/lib/navigation/canonical-context";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { getConversationWithMessages, getLatestConversationId, listSessions } from "@/lib/vera/conversations";
import { getVeraUsageSnapshot } from "@/lib/vera/ledger";
import { isUuid } from "@/lib/vera/sources/types";
import { getStudioDocument, listStudioDocuments } from "@/lib/vera/studio-documents";
import { VeraPageModule } from "@/modules/vera/VeraPageModule";

/** The name the back button gives for each page it can return to. Anything else returns to the dashboard, named "beranda". */
const RETURN_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["/courses", "Materi"],
  ["/quiz", "Kuis"],
  ["/tryout", "Tryout"],
  ["/settings", "profil"],
];

function returnLabelOf(href: string) {
  const path = href.split("?")[0];
  return RETURN_LABELS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? "beranda";
}

/**
 * `?c=<id>` opens that session, `?c=new` opens an empty one, and no valid parameter opens the latest session.
 * `?c=new&n=<nonce>` opens a new session even when the page already shows one. "Sesi baru" adds the nonce.
 * `?tab=studio&doc=<id>` opens the Studio tab with that document open.
 * `returnTo` names the page the back button returns to. Without a valid one, it returns to the dashboard.
 */
export default async function VeraAiPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; tab?: string; doc?: string; n?: string; returnTo?: string }>;
}) {
  const [session, query] = await Promise.all([requireStudentSession(), searchParams]);
  const studentId = session.user.id;
  const { c, tab, doc, n } = query;
  const nonce = n && /^\d{1,16}$/u.test(n) ? n : "";
  const explicit = c === "new" ? "new" : c && isUuid(c) ? c : undefined;
  const initialTab = tab === "studio" ? "studio" : "chat";
  const backHref = buildStudentReturnHref(parseStudentContext(query).returnTo);
  const returnHref = backHref.startsWith("/vera-ai") ? "/dashboard" : backHref;
  const firstName = session.user.fullName?.trim().split(/\s+/)[0] || null;
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
    <main className="student-page-canvas flex h-dvh min-h-0 flex-col overflow-hidden p-3 lg:p-4">
      <VeraPageModule
        // A new key remounts the page when the session, the tab, the open document or the nonce changes, so each starts from its own state.
        key={`${conversation?.id ?? "new"}:${initialTab}:${initialStudioDocument?.id ?? ""}:${nonce}`}
        conversationId={conversation?.id ?? null}
        firstName={firstName}
        initialMessages={conversation?.messages ?? []}
        initialSessions={initialSessions}
        initialStudioDocs={initialStudioDocs}
        initialStudioDocument={initialStudioDocument}
        initialTab={initialTab}
        initialUsage={initialUsage}
        notificationFeed={notificationFeed}
        returnHref={returnHref}
        returnLabel={returnLabelOf(returnHref)}
        session={session}
        studentId={studentId}
      />
    </main>
  );
}

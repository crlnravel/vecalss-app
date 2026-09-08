import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  buildMentorTryoutHref,
  buildMentorTryoutOperationsHref,
  canonicalContextMessage,
  getSafeRedirectUrl,
  parseMentorTryoutAttemptContext,
  type CanonicalContextIssue,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { getOwnedTryoutOperationsView } from "@/lib/tryout/operations-view";
import { KaptenTryoutAttemptDetailPageModule } from "@/modules/mentor/KaptenTryoutAttemptDetailPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Detail Attempt Tryout | Vecalss LMS" };

export default async function TryoutAttemptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string; tryoutId: string }>;
  searchParams: Promise<Record<string, NavigationQueryValue>>;
}) {
  const [{ attemptId, tryoutId }, query, session] = await Promise.all([
    params,
    searchParams,
    requireTutorSession(),
  ]);
  const parsedQuery = parseMentorTryoutAttemptContext(query);
  if (parsedQuery.issues.length) {
    return (
      <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Detail Attempt" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session} showSearch={false} sidebarAppearance="reference">
        <section aria-labelledby="tryout-attempt-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8" role="alert">
          <h1 className="text-lg font-semibold" id="tryout-attempt-context-unavailable">Konteks attempt tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(parsedQuery.issues)}</p>
        </section>
      </MentorWorkspaceShell>
    );
  }
  const operations = await getOwnedTryoutOperationsView(
    tryoutId,
    session.user.id,
  );
  if (!operations) notFound();
  if (operations.status !== "published") redirect(getSafeRedirectUrl(buildMentorTryoutHref(tryoutId, { delivery: parsedQuery.delivery, parent: parsedQuery.parent, returnTo: parsedQuery.returnTo, session: parsedQuery.session, workspace: parsedQuery.workspace ?? "basics" }), ["/mentor/tryout"]));
  const delivery = operations.sessions.find((candidate) => candidate.attempts.some((attempt) => attempt.id === attemptId));
  const attempt = delivery?.attempts.find((candidate) => candidate.id === attemptId);
  if (!delivery || !attempt) notFound();
  const issues: CanonicalContextIssue[] = [];
  if (parsedQuery.session && parsedQuery.session !== delivery.id) issues.push({ code: "unsupported" as const, field: "session" as const, message: "Sesi attempt tidak cocok dengan detail yang dipilih.", value: parsedQuery.session });
  if (parsedQuery.participant && parsedQuery.participant !== attempt.admissionId) issues.push({ code: "unsupported" as const, field: "participant" as const, message: "Peserta attempt tidak cocok dengan detail yang dipilih.", value: parsedQuery.participant });
  if (issues.length) {
    return (
      <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Detail Attempt" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session} showSearch={false} sidebarAppearance="reference">
        <section aria-labelledby="tryout-attempt-mismatch" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8" role="alert">
          <h1 className="text-lg font-semibold" id="tryout-attempt-mismatch">Konteks attempt tidak cocok</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(issues)}</p>
        </section>
      </MentorWorkspaceShell>
    );
  }
  const backHref = buildMentorTryoutOperationsHref(tryoutId, { delivery: parsedQuery.delivery, parent: parsedQuery.parent, returnTo: parsedQuery.returnTo, session: delivery.id, workspace: parsedQuery.workspace });

  return (
    <MentorWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Detail Attempt"
      contentElement="div"
      mainClassName="max-w-none"
      searchPlaceholder="Cari Tryout..."
      session={session}
      showSearch={false}
      sidebarAppearance="reference"
    >
      <KaptenTryoutAttemptDetailPageModule
        attemptId={attemptId}
        backHref={backHref}
        initial={operations}
      />
    </MentorWorkspaceShell>
  );
}

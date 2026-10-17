import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  buildMentorTryoutHref,
  buildMentorTryoutAttemptBackHref,
  getSafeRedirectUrl,
  parseMentorTryoutAttemptContext,
  type CanonicalContextIssue,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { inspectTryoutCalculation } from "@/lib/tryout/result-repository";
import { getOwnedTryoutOperationsView } from "@/lib/tryout/operations-view";
import { KaptenTryoutArchivedHistoryFrame } from "@/modules/mentor/KaptenTryoutArchivedHistoryPageModule";
import { KaptenTryoutAttemptDetailPageModule } from "@/modules/mentor/KaptenTryoutAttemptDetailPageModule";
import { KaptenTryoutWorkspaceFrame } from "@/modules/mentor/KaptenTryoutWorkspaceFrame";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Detail Pengerjaan Tryout | Vecalss LMS" };

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
      <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Detail pengerjaan" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session} showSearch={false} sidebarAppearance="reference">
        <section aria-labelledby="tryout-attempt-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8" role="alert">
          <h1 className="text-lg font-semibold" id="tryout-attempt-context-unavailable">Detail pengerjaan tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">Tautan ini tidak sesuai dengan detail Tryout. Kembali ke sesi Tryout, lalu buka lagi pengerjaan peserta.</p>
        </section>
      </MentorWorkspaceShell>
    );
  }
  const operations = await getOwnedTryoutOperationsView(
    tryoutId,
    session.user.id,
  );
  if (!operations) notFound();
  if (operations.status !== "published" && operations.status !== "archived") redirect(getSafeRedirectUrl(buildMentorTryoutHref(tryoutId, { delivery: parsedQuery.delivery, parent: parsedQuery.parent, returnTo: parsedQuery.returnTo, session: parsedQuery.session, workspace: parsedQuery.workspace ?? "basics" }), ["/mentor/tryout"]));
  const delivery = operations.sessions.find((candidate) => candidate.attempts.some((attempt) => attempt.id === attemptId));
  const attempt = delivery?.attempts.find((candidate) => candidate.id === attemptId);
  if (!delivery || !attempt) notFound();
  const issues: CanonicalContextIssue[] = [];
  if (parsedQuery.session && parsedQuery.session !== delivery.id) issues.push({ code: "unsupported" as const, field: "session" as const, message: "Sesi Tryout tidak sesuai dengan detail yang dipilih.", value: parsedQuery.session });
  if (parsedQuery.participant && parsedQuery.participant !== attempt.admissionId) issues.push({ code: "unsupported" as const, field: "participant" as const, message: "Peserta tidak sesuai dengan detail yang dipilih.", value: parsedQuery.participant });
  if (issues.length) {
    return (
      <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Detail pengerjaan" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session} showSearch={false} sidebarAppearance="reference">
        <section aria-labelledby="tryout-attempt-mismatch" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8" role="alert">
          <h1 className="text-lg font-semibold" id="tryout-attempt-mismatch">Detail pengerjaan tidak cocok</h1>
          <p className="mt-2 text-sm leading-6">Sesi atau peserta di tautan ini berbeda dari detail yang dipilih. Kembali ke sesi Tryout, lalu buka lagi pengerjaan peserta.</p>
        </section>
      </MentorWorkspaceShell>
    );
  }
  const backHref = buildMentorTryoutAttemptBackHref(tryoutId, { ...parsedQuery, session: delivery.id });
  const backLabel = parsedQuery.workspace === "participants" ? "Kembali ke hasil sesi" : "Kembali ke sesi Tryout";

  const resultRecovery = await inspectTryoutCalculation({ attemptId, tryoutId, sessionId: delivery.id }, session.user.id);

  if (operations.status === "archived") {
    return (
      <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Pengerjaan" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session} showSearch={false} sidebarAppearance="reference">
        <KaptenTryoutArchivedHistoryFrame backHref={buildMentorTryoutHref(tryoutId)} backLabel="Kembali ke riwayat Tryout" initial={operations}>
          <KaptenTryoutAttemptDetailPageModule attemptId={attemptId} backHref={backHref} backLabel={backLabel} embedded initial={operations} readOnly resultRecovery={resultRecovery} />
        </KaptenTryoutArchivedHistoryFrame>
      </MentorWorkspaceShell>
    );
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Pengerjaan"
      contentElement="div"
      mainClassName="max-w-none"
      searchPlaceholder="Cari Tryout..."
      session={session}
      showSearch={false}
      sidebarAppearance="reference"
    >
      <KaptenTryoutWorkspaceFrame
        activeTab={parsedQuery.workspace === "participants" ? "participants" : "operations"}
        initial={operations}
        parentId={parsedQuery.parent}
      >
        <KaptenTryoutAttemptDetailPageModule attemptId={attemptId} backHref={backHref} backLabel={backLabel} embedded initial={operations} resultRecovery={resultRecovery} />
      </KaptenTryoutWorkspaceFrame>
    </MentorWorkspaceShell>
  );
}

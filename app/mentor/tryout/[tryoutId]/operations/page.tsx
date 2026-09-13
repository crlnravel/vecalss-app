import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  canonicalContextMessage,
  parseMentorTryoutContext,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { getOwnedTryoutOperationsView } from "@/lib/tryout/operations-view";
import { KaptenTryoutOperationsModule } from "@/modules/mentor/KaptenTryoutOperationsModule";
import { TryoutLifecycleMenu } from "@/modules/mentor/KaptenTryoutWorkspaceHeader";
import { KaptenTryoutWorkspaceFrame } from "@/modules/mentor/KaptenTryoutWorkspaceFrame";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Operasional Tryout | Vecalss LMS" };

export default async function TryoutOperationsPage({ params, searchParams }: { params: Promise<{ tryoutId: string }>; searchParams: Promise<Record<string, NavigationQueryValue>> }) {
  const [{ tryoutId }, session, query] = await Promise.all([params, requireTutorSession(), searchParams]);
  const parsed = parseMentorTryoutContext(query);
  if (parsed.issues.length) {
    return (
      <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Detail" searchPlaceholder="Cari Tryout..." session={session} showSearch={false} sidebarAppearance="reference">
        <section aria-labelledby="tryout-operations-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8" role="alert">
          <h1 className="text-lg font-semibold" id="tryout-operations-context-unavailable">Konteks operasional Tryout tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(parsed.issues)}</p>
        </section>
      </MentorWorkspaceShell>
    );
  }
  if (parsed.delivery === "policy") redirect(`/mentor/tryout/${tryoutId}/operations/policy`);
  if (parsed.delivery === "participants") redirect(`/mentor/tryout/${tryoutId}/operations/participants`);
  if (parsed.delivery === "sessions") redirect(`/mentor/tryout/${tryoutId}/operations`);

  const operations = await getOwnedTryoutOperationsView(tryoutId, session.user.id);
  if (!operations) notFound();
  return (
    <MentorWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Detail"
      contentElement="div"
      mainClassName="max-w-none"
      searchPlaceholder="Cari Tryout..."
      session={session}
      showSearch={false}
      sidebarAppearance="reference"
    >
      <KaptenTryoutWorkspaceFrame
        actions={
          <TryoutLifecycleMenu
            allowDuplicate={operations.status === "published"}
            hasActiveAttempt={operations.attempts.some((attempt) => attempt.attemptState === "in_progress" || attempt.status === "in_progress")}
            status={operations.status}
            tryoutId={tryoutId}
          />
        }
        activeTab="operations"
        initial={operations}
        parentId={parsed.parent}
      >
        <KaptenTryoutOperationsModule embedded initial={operations} />
      </KaptenTryoutWorkspaceFrame>
    </MentorWorkspaceShell>
  );
}

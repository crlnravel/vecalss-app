import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import type { NavigationQueryValue } from "@/lib/navigation/canonical-context";
import { getOwnedTryoutOperationsView, toTryoutWorkspaceView } from "@/lib/tryout/operations-view";
import { KaptenTryoutParticipantsPageModule } from "@/modules/mentor/KaptenTryoutParticipantsPageModule";
import { TryoutLifecycleMenu } from "@/modules/mentor/KaptenTryoutWorkspaceHeader";
import { KaptenTryoutWorkspaceFrame } from "@/modules/mentor/KaptenTryoutWorkspaceFrame";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Peserta Tryout | Vecalss LMS" };

export default async function TryoutParticipantsPage({ params, searchParams }: { params: Promise<{ tryoutId: string }>; searchParams: Promise<Record<string, NavigationQueryValue>> }) {
  const [{ tryoutId }, session, query] = await Promise.all([params, requireTutorSession(), searchParams]);
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
        activeTab="participants"
        initial={operations}
        parentId={typeof query.parent === "string" ? query.parent : undefined}
      >
        <KaptenTryoutParticipantsPageModule
          embedded
          initial={toTryoutWorkspaceView(operations)}
          parentId={typeof query.parent === "string" ? query.parent : undefined}
        />
      </KaptenTryoutWorkspaceFrame>
    </MentorWorkspaceShell>
  );
}

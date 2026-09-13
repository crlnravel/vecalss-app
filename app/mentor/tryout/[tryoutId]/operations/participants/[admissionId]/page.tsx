import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import type { NavigationQueryValue } from "@/lib/navigation/canonical-context";
import { getOwnedTryoutOperationsView } from "@/lib/tryout/operations-view";
import { KaptenTryoutParticipantDetailPageModule } from "@/modules/mentor/KaptenTryoutParticipantDetailPageModule";
import { TryoutLifecycleMenu } from "@/modules/mentor/KaptenTryoutWorkspaceHeader";
import { KaptenTryoutWorkspaceFrame } from "@/modules/mentor/KaptenTryoutWorkspaceFrame";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Detail Peserta Tryout | Vecalss LMS" };

export default async function TryoutParticipantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ admissionId: string; tryoutId: string }>;
  searchParams: Promise<Record<string, NavigationQueryValue>>;
}) {
  const [{ admissionId, tryoutId }, session, query] = await Promise.all([
    params,
    requireTutorSession(),
    searchParams,
  ]);
  const operations = await getOwnedTryoutOperationsView(
    tryoutId,
    session.user.id,
  );
  if (!operations) notFound();
  if (operations.status !== "published") redirect(`/mentor/tryout/${tryoutId}?workspace=basics`);
  if (!operations.admissions.some((item) => item.id === admissionId)) {
    notFound();
  }

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
        <KaptenTryoutParticipantDetailPageModule admissionId={admissionId} embedded initial={operations} />
      </KaptenTryoutWorkspaceFrame>
    </MentorWorkspaceShell>
  );
}

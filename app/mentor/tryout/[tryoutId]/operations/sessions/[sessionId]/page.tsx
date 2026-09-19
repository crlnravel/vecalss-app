import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import type { NavigationQueryValue } from "@/lib/navigation/canonical-context";
import { getOwnedTryoutOperationsView } from "@/lib/tryout/operations-view";
import { KaptenTryoutSessionDetailPageModule } from "@/modules/mentor/KaptenTryoutSessionDetailPageModule";
import { KaptenTryoutWorkspaceFrame } from "@/modules/mentor/KaptenTryoutWorkspaceFrame";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Detail Sesi Tryout | Vecalss LMS" };

export default async function TryoutSessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string; tryoutId: string }>;
  searchParams: Promise<Record<string, NavigationQueryValue>>;
}) {
  const [{ sessionId, tryoutId }, session, query] = await Promise.all([
    params,
    requireTutorSession(),
    searchParams,
  ]);
  const operations = await getOwnedTryoutOperationsView(
    tryoutId,
    session.user.id,
  );
  if (!operations) notFound();
  if (!operations.sessions.some((item) => item.id === sessionId)) notFound();

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
        activeTab="operations"
        initial={operations}
        parentId={typeof query.parent === "string" ? query.parent : undefined}
      >
        <KaptenTryoutSessionDetailPageModule embedded initial={operations} sessionId={sessionId} />
      </KaptenTryoutWorkspaceFrame>
    </MentorWorkspaceShell>
  );
}

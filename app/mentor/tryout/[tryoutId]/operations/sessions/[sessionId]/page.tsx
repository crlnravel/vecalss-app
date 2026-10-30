import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { buildMentorTryoutHref, buildMentorTryoutOperationsHref, parseMentorTryoutContext, type NavigationQueryValue } from "@/lib/navigation/canonical-context";
import { getOwnedTryoutOperationsView } from "@/lib/tryout/operations-view";
import { KaptenTryoutSessionDetailPageModule } from "@/modules/mentor/KaptenTryoutSessionDetailPageModule";
import { KaptenTryoutWorkspaceFrame } from "@/modules/mentor/KaptenTryoutWorkspaceFrame";
import { TryoutOperationsNavigation } from "@/modules/mentor/TryoutOperationsNavigation";
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
  const delivery = operations.sessions.find((item) => item.id === sessionId);
  if (!delivery) notFound();
  const context = parseMentorTryoutContext(query);
  if (context.issues.length) notFound();

  return (
    <MentorWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel={delivery.name}
      breadcrumbAncestors={[{ href: buildMentorTryoutHref(tryoutId, { parent: context.parent, returnTo: context.returnTo }), label: operations.title }]}
      breadcrumbParent={{ href: buildMentorTryoutOperationsHref(tryoutId, { ...context, workspace: "operations", delivery: "sessions" }), label: "Jadwal" }}
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
        <TryoutOperationsNavigation initial={operations} active="sessions" parentId={typeof query.parent === "string" ? query.parent : undefined} />
        <KaptenTryoutSessionDetailPageModule embedded initial={operations} sessionId={sessionId} />
      </KaptenTryoutWorkspaceFrame>
    </MentorWorkspaceShell>
  );
}

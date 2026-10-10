import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { buildMentorTryoutOperationsHref, canonicalQueryEquals, parseMentorTryoutContext, type NavigationQueryValue } from "@/lib/navigation/canonical-context";
import { getOwnedTryoutOperationsView, toTryoutWorkspaceView } from "@/lib/tryout/operations-view";
import { KaptenTryoutParticipantDetailPageModule } from "@/modules/mentor/KaptenTryoutParticipantDetailPageModule";
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
  const parsed = parseMentorTryoutContext(query);
  if (parsed.issues.length) notFound();
  if (!operations.admissions.some((item) => item.id === admissionId)) {
    notFound();
  }
  const initial = toTryoutWorkspaceView(operations);
  const backHref = buildMentorTryoutOperationsHref(tryoutId, { ...parsed, workspace: "operations", delivery: "participants" });
  const detailHref = `/mentor/tryout/${encodeURIComponent(tryoutId)}/operations/participants/${encodeURIComponent(admissionId)}?${new URL(backHref, "https://vecalss.invalid").searchParams}`;
  if (!canonicalQueryEquals(query, detailHref)) redirect(detailHref);

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
        initial={initial}
        parentId={typeof query.parent === "string" ? query.parent : undefined}
      >
        <KaptenTryoutParticipantDetailPageModule admissionId={admissionId} embedded initial={initial} backHref={backHref} />
      </KaptenTryoutWorkspaceFrame>
    </MentorWorkspaceShell>
  );
}

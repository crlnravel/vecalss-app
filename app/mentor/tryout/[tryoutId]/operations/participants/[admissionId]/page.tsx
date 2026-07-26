import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getOwnedTryoutOperationsView } from "@/lib/tryout/operations-view";
import { KaptenTryoutParticipantDetailPageModule } from "@/modules/mentor/KaptenTryoutParticipantDetailPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Detail Peserta Tryout | Vecalss LMS" };

export default async function TryoutParticipantDetailPage({
  params,
}: {
  params: Promise<{ admissionId: string; tryoutId: string }>;
}) {
  const [{ admissionId, tryoutId }, session] = await Promise.all([
    params,
    requireTutorSession(),
  ]);
  const operations = await getOwnedTryoutOperationsView(
    tryoutId,
    session.user.id,
  );
  if (!operations?.admissions.some((item) => item.id === admissionId)) {
    notFound();
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Detail Peserta"
      mainClassName="max-w-none"
      searchPlaceholder="Cari Tryout..."
      session={session}
    >
      <KaptenTryoutParticipantDetailPageModule
        admissionId={admissionId}
        initial={operations}
      />
    </MentorWorkspaceShell>
  );
}

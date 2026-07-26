import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getOwnedTryoutOperationsView } from "@/lib/tryout/operations-view";
import { KaptenTryoutSessionDetailPageModule } from "@/modules/mentor/KaptenTryoutSessionDetailPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Detail Sesi Tryout | Vecalss LMS" };

export default async function TryoutSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string; tryoutId: string }>;
}) {
  const [{ sessionId, tryoutId }, session] = await Promise.all([
    params,
    requireTutorSession(),
  ]);
  const operations = await getOwnedTryoutOperationsView(
    tryoutId,
    session.user.id,
  );
  if (!operations?.sessions.some((item) => item.id === sessionId)) notFound();

  return (
    <MentorWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Detail Sesi"
      mainClassName="max-w-none"
      searchPlaceholder="Cari Tryout..."
      session={session}
    >
      <KaptenTryoutSessionDetailPageModule
        initial={operations}
        sessionId={sessionId}
      />
    </MentorWorkspaceShell>
  );
}

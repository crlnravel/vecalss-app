import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getOwnedTryoutOperationsView } from "@/lib/tryout/operations-view";
import { KaptenTryoutSessionDetailPageModule } from "@/modules/mentor/KaptenTryoutSessionDetailPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Detail Sesi Tryout | Vecalss LMS" };

export default async function TryoutSessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string; tryoutId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ sessionId, tryoutId }, query, session] = await Promise.all([
    params,
    searchParams,
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
        initialTab={query.tab === "details" ? "details" : "attempts"}
        sessionId={sessionId}
      />
    </MentorWorkspaceShell>
  );
}

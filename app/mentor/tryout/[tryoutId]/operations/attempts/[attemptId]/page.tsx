import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getOwnedTryoutOperationsView } from "@/lib/tryout/operations-view";
import { KaptenTryoutAttemptDetailPageModule } from "@/modules/mentor/KaptenTryoutAttemptDetailPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Detail Attempt Tryout | Vecalss LMS" };

export default async function TryoutAttemptDetailPage({
  params,
}: {
  params: Promise<{ attemptId: string; tryoutId: string }>;
}) {
  const [{ attemptId, tryoutId }, session] = await Promise.all([
    params,
    requireTutorSession(),
  ]);
  const operations = await getOwnedTryoutOperationsView(
    tryoutId,
    session.user.id,
  );
  const attemptExists = operations?.sessions.some((delivery) =>
    delivery.attempts.some((attempt) => attempt.id === attemptId),
  );
  if (!operations || !attemptExists) notFound();

  return (
    <MentorWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Detail Attempt"
      contentElement="div"
      mainClassName="max-w-none"
      searchPlaceholder="Cari Tryout..."
      session={session}
    >
      <KaptenTryoutAttemptDetailPageModule
        attemptId={attemptId}
        initial={operations}
      />
    </MentorWorkspaceShell>
  );
}

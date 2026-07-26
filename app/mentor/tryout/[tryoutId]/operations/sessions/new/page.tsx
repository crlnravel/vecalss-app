import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getOwnedTryoutOperationsView } from "@/lib/tryout/operations-view";
import { KaptenTryoutSessionCreatePageModule } from "@/modules/mentor/KaptenTryoutSessionCreatePageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Buat Sesi Tryout | Vecalss LMS" };

export default async function NewTryoutSessionPage({
  params,
}: {
  params: Promise<{ tryoutId: string }>;
}) {
  const [{ tryoutId }, session] = await Promise.all([
    params,
    requireTutorSession(),
  ]);
  const operations = await getOwnedTryoutOperationsView(
    tryoutId,
    session.user.id,
  );
  if (!operations) notFound();

  return (
    <MentorWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Buat Sesi"
      mainClassName="max-w-none"
      searchPlaceholder="Cari Tryout..."
      session={session}
    >
      <KaptenTryoutSessionCreatePageModule initial={operations} />
    </MentorWorkspaceShell>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getOwnedTryoutOperationsView } from "@/lib/tryout/operations-view";
import { getTryoutForEdit, listReadyPackageVersions } from "@/lib/tryout/repository";
import { KaptenTryoutBuilderPageModule } from "@/modules/mentor/KaptenTryoutBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Edit Tryout Kapten | Vecalss LMS" };

export default async function TryoutPage({ params, searchParams }: { params: Promise<{ tryoutId: string }>; searchParams: Promise<{ workspace?: string }> }) {
  const [{ tryoutId }, query, session] = await Promise.all([params, searchParams, requireTutorSession()]);
  const [initialDraft, operationsInitial, readyVersions] = await Promise.all([getTryoutForEdit(tryoutId, session.user.id), getOwnedTryoutOperationsView(tryoutId, session.user.id), listReadyPackageVersions(session.user.id)]);
  if (!initialDraft || !operationsInitial) notFound();
  const initialWorkspace = query.workspace === "policy" || query.workspace === "participants" || query.workspace === "sessions"
    ? query.workspace
    : query.workspace === "operations"
      ? "sessions"
      : "authoring";
  return <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Edit Tryout" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session}><KaptenTryoutBuilderPageModule id={tryoutId} initialDraft={initialDraft} initialWorkspace={initialWorkspace} operationsInitial={operationsInitial} readyVersions={readyVersions} session={session} /></MentorWorkspaceShell>;
}

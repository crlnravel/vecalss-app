import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBankSourcePage } from "@/lib/question-bank/repository";
import { listReadyAssemblyRevisions } from "@/lib/tryout/assembly-repository";
import { getOwnedTryoutOperationsView, toTryoutWorkspaceView } from "@/lib/tryout/operations-view";
import { getTryoutForEdit, listReadyPackageVersions, resolveReusableQuestionPackageHandoff } from "@/lib/tryout/repository";
import { KaptenTryoutBuilderPageModule } from "@/modules/mentor/KaptenTryoutBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Edit Tryout Kapten | Vecalss LMS" };

export default async function TryoutPage({ params, searchParams }: { params: Promise<{ tryoutId: string }>; searchParams: Promise<{ delivery?: string; packageId?: string; packageVersionId?: string; parent?: string; session?: string; subtest?: string; workspace?: string }> }) {
  const [{ tryoutId }, query, session] = await Promise.all([params, searchParams, requireTutorSession()]);
  const [initialDraft, operations, readyVersions, readyAssemblies, sourceCatalog, parentDraft, handoffResolution] = await Promise.all([
    getTryoutForEdit(tryoutId, session.user.id),
    getOwnedTryoutOperationsView(tryoutId, session.user.id),
    listReadyPackageVersions(session.user.id),
    listReadyAssemblyRevisions(),
    listQuestionBankSourcePage({ page: 1, pageSize: 20 }),
    query.parent ? getTryoutForEdit(query.parent, session.user.id) : Promise.resolve(null),
    resolveReusableQuestionPackageHandoff({ packageId: query.packageId, packageVersionId: query.packageVersionId, subtest: query.subtest, tryoutId }, session.user.id),
  ]);
  // The builder only needs session schedule/release metadata and a gated
  // ParticipantView. Keep attempt details and hidden scores on separately
  // authorized detail routes so the client-bound workspace cannot inspect
  // embargoed results by walking its initial props.
  const operationsInitial = operations ? toTryoutWorkspaceView(operations) : null;
  if (!initialDraft || !operationsInitial) notFound();
  // The workspace module owns the new eight-area vocabulary and maps the
  // transitional authoring/policy/sessions/participants query values for
  // bookmarked compatibility URLs.
  const initialWorkspace = query.workspace ?? (handoffResolution.handoff ? "sections" : initialDraft.status === "published" ? "delivery" : "basics");
  return <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Edit Tryout" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session}><KaptenTryoutBuilderPageModule id={tryoutId} initialDeliveryArea={query.delivery} initialDraft={initialDraft} initialPackageHandoff={handoffResolution.handoff ?? undefined} initialPackageHandoffError={handoffResolution.error ?? undefined} initialParent={parentDraft ? { id: parentDraft.id, publishedAt: parentDraft.assessmentRelease?.publishedAt, title: parentDraft.title } : undefined} initialSessionId={query.session} initialSourceBankTotal={sourceCatalog.total} initialSourceBanks={sourceCatalog.items.map(({ bank }) => bank)} initialWorkspace={initialWorkspace} operationsInitial={operationsInitial} readyAssemblies={readyAssemblies} readyVersions={readyVersions} session={session} /></MentorWorkspaceShell>;
}

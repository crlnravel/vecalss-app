import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBankSourcePage } from "@/lib/question-bank/repository";
import { getOwnedTryoutOperationsView, toTryoutWorkspaceView } from "@/lib/tryout/operations-view";
import { getTryoutForEdit } from "@/lib/tryout/repository";
import { KaptenTryoutBuilderPageModule } from "@/modules/mentor/KaptenTryoutBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Edit Tryout Kapten | Vecalss LMS" };

export default async function TryoutPage({ params, searchParams }: { params: Promise<{ tryoutId: string }>; searchParams: Promise<{ delivery?: string; parent?: string; session?: string; workspace?: string }> }) {
  const [{ tryoutId }, query, session] = await Promise.all([params, searchParams, requireTutorSession()]);
  const [initialDraft, operations, sourceCatalog, parentDraft] = await Promise.all([
    getTryoutForEdit(tryoutId, session.user.id),
    getOwnedTryoutOperationsView(tryoutId, session.user.id),
    listQuestionBankSourcePage({ page: 1, pageSize: 20 }),
    query.parent ? getTryoutForEdit(query.parent, session.user.id) : Promise.resolve(null),
  ]);
  // The builder only needs session schedule/release metadata and a gated
  // ParticipantView. Keep attempt details and hidden scores on separately
  // authorized detail routes so the client-bound workspace cannot inspect
  // embargoed results by walking its initial props.
  const operationsInitial = operations ? toTryoutWorkspaceView(operations) : null;
  if (!initialDraft || !operationsInitial) notFound();
  const initialWorkspace = query.workspace ?? (initialDraft.status === "published" ? "delivery" : "basics");
  return <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel={initialDraft.status === "published" ? "Detail Tryout" : "Edit Tryout"} contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session} showSearch={false} sidebarAppearance="reference"><KaptenTryoutBuilderPageModule id={tryoutId} initialDeliveryArea={query.delivery} initialDraft={initialDraft} initialParent={parentDraft ? { id: parentDraft.id, publishedAt: parentDraft.assessmentRelease?.publishedAt, title: parentDraft.title } : undefined} initialSessionId={query.session} initialSourceBankTotal={sourceCatalog.total} initialSourceBanks={sourceCatalog.items.map(({ bank }) => bank)} initialWorkspace={initialWorkspace} operationsInitial={operationsInitial} session={session} /></MentorWorkspaceShell>;
}

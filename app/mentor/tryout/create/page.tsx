import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBankSourcePage } from "@/lib/question-bank/repository";
import { listReadyAssemblyRevisions } from "@/lib/tryout/assembly-repository";
import { listReadyPackageVersions, resolveReusableQuestionPackageHandoff } from "@/lib/tryout/repository";
import { KaptenTryoutBuilderPageModule } from "@/modules/mentor/KaptenTryoutBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Buat Tryout Kapten | Vecalss LMS" };

export default async function CreateTryoutPage({ searchParams }: { searchParams: Promise<{ packageId?: string; packageVersionId?: string; subtest?: string; workspace?: string }> }) {
  const [session, query] = await Promise.all([requireTutorSession(), searchParams]);
  const [readyVersions, readyAssemblies, sourceCatalog, handoffResolution] = await Promise.all([
    listReadyPackageVersions(session.user.id),
    listReadyAssemblyRevisions(),
    listQuestionBankSourcePage({ page: 1, pageSize: 20 }),
    resolveReusableQuestionPackageHandoff({ packageId: query.packageId, packageVersionId: query.packageVersionId, subtest: query.subtest }, session.user.id),
  ]);
  const initialWorkspace = query.workspace ?? (handoffResolution.handoff ? "sections" : "basics");
  return <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Buat Tryout" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session}><KaptenTryoutBuilderPageModule initialPackageHandoff={handoffResolution.handoff ?? undefined} initialPackageHandoffError={handoffResolution.error ?? undefined} initialSourceBankTotal={sourceCatalog.total} initialSourceBanks={sourceCatalog.items.map(({ bank }) => bank)} initialWorkspace={initialWorkspace} readyAssemblies={readyAssemblies} readyVersions={readyVersions} session={session} /></MentorWorkspaceShell>;
}

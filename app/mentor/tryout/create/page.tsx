import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBankSourcePage } from "@/lib/question-bank/repository";
import { listReadyAssemblyRevisions } from "@/lib/tryout/assembly-repository";
import { listReadyPackageVersions } from "@/lib/tryout/repository";
import { KaptenTryoutBuilderPageModule } from "@/modules/mentor/KaptenTryoutBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Buat Tryout Kapten | Vecalss LMS" };

export default async function CreateTryoutPage() {
  const session = await requireTutorSession();
  const [readyVersions, readyAssemblies, sourceCatalog] = await Promise.all([listReadyPackageVersions(session.user.id), listReadyAssemblyRevisions(), listQuestionBankSourcePage({ page: 1, pageSize: 20 })]);
  return <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Buat Tryout" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session}><KaptenTryoutBuilderPageModule initialSourceBankTotal={sourceCatalog.total} initialSourceBanks={sourceCatalog.items.map(({ bank }) => bank)} readyAssemblies={readyAssemblies} readyVersions={readyVersions} session={session} /></MentorWorkspaceShell>;
}

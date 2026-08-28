import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBankSourcePage } from "@/lib/question-bank/repository";
import { KaptenTryoutBuilderPageModule } from "@/modules/mentor/KaptenTryoutBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Buat Tryout Kapten | Vecalss LMS" };

export default async function CreateTryoutPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const [session, query, sourceCatalog] = await Promise.all([
    requireTutorSession(),
    searchParams,
    listQuestionBankSourcePage({ page: 1, pageSize: 20 }),
  ]);
  const initialWorkspace = query.workspace ?? "basics";
  return <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Buat Tryout" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session} sidebarAppearance="reference"><KaptenTryoutBuilderPageModule initialSourceBankTotal={sourceCatalog.total} initialSourceBanks={sourceCatalog.items.map(({ bank }) => bank)} initialWorkspace={initialWorkspace} session={session} /></MentorWorkspaceShell>;
}

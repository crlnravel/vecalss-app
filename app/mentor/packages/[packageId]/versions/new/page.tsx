import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBankCategories, listQuestionBankSourcePage } from "@/lib/question-bank/repository";
import { getReusableQuestionPackageForEdit } from "@/lib/tryout/repository";
import { KaptenPackageBuilderPageModule } from "@/modules/mentor/KaptenPackageBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Versi Baru Paket Soal | Vecalss LMS" };

export default async function NewPackageVersionPage({ params }: { params: Promise<{ packageId: string }> }) {
  const [{ packageId }, session] = await Promise.all([params, requireTutorSession()]);
  const initialDraft = await getReusableQuestionPackageForEdit(packageId, session.user.id);
  if (!initialDraft) notFound();
  const [sourcePage, sourceCategories] = await Promise.all([
    listQuestionBankSourcePage({ page: 1, pageSize: 20, subjectCoverage: [initialDraft.subtest] }),
    listQuestionBankCategories(),
  ]);
  return <MentorWorkspaceShell activeLabel="Paket Soal" breadcrumbLabel="Versi Baru" mainClassName="max-w-none" searchPlaceholder="Cari Paket Soal..." session={session}><KaptenPackageBuilderPageModule id={packageId} initialDraft={initialDraft} sourceCatalog={sourcePage.items.map(({ bank }) => ({ bank, questions: [] }))} sourceCatalogPage={sourcePage} sourceCategories={sourceCategories} /></MentorWorkspaceShell>;
}

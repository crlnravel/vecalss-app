import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBankCategories, listQuestionBankSourcePage } from "@/lib/question-bank/repository";
import { KaptenPackageBuilderPageModule } from "@/modules/mentor/KaptenPackageBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Buat Paket Soal Kapten | Vecalss LMS" };

export default async function CreatePackagePage() {
  const session = await requireTutorSession();
  const [sourcePage, sourceCategories] = await Promise.all([
    listQuestionBankSourcePage({ page: 1, pageSize: 20 }),
    listQuestionBankCategories(),
  ]);

  return <MentorWorkspaceShell activeLabel="Paket Soal" breadcrumbLabel="Buat Paket Soal" mainClassName="max-w-none" searchPlaceholder="Cari Paket Soal..." session={session}><KaptenPackageBuilderPageModule sourceCatalog={sourcePage.items.map(({ bank }) => ({ bank, questions: [] }))} sourceCatalogPage={sourcePage} sourceCategories={sourceCategories} /></MentorWorkspaceShell>;
}

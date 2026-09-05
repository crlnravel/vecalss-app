import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBankCategories, listQuestionBankSourcePage } from "@/lib/question-bank/repository";
import { KaptenPackageBuilderPageModule } from "@/modules/mentor/KaptenPackageBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Buat Paket Soal Kapten | Vecalss LMS" };

export default async function CreatePackagePage() {
  const session = await requireTutorSession();
  const [sourcePage, sourceCategories] = await Promise.all([
    listQuestionBankSourcePage({ page: 1, pageSize: 20, purpose: "tryout" }),
    listQuestionBankCategories("tryout"),
  ]);

  return <MentorWorkspaceShell activeLabel="Paket Soal" breadcrumbLabel="Buat Paket Soal" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Paket Soal..." session={session} showSearch={false} sidebarAppearance="reference"><KaptenPackageBuilderPageModule sourceCatalogPage={sourcePage} sourceCategories={sourceCategories} /></MentorWorkspaceShell>;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBankSources } from "@/lib/question-bank/repository";
import { getReusableQuestionPackageForEdit } from "@/lib/tryout/repository";
import { KaptenPackageBuilderPageModule } from "@/modules/mentor/KaptenPackageBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Versi Baru Paket Soal | Vecalss LMS" };

export default async function NewPackageVersionPage({ params }: { params: Promise<{ packageId: string }> }) {
  const [{ packageId }, session] = await Promise.all([params, requireTutorSession()]);
  const [initialDraft, sourceCatalog] = await Promise.all([getReusableQuestionPackageForEdit(packageId, session.user.id), listQuestionBankSources()]);
  if (!initialDraft) notFound();
  return <MentorWorkspaceShell activeLabel="Paket Soal" breadcrumbLabel="Versi Baru" mainClassName="max-w-none" searchPlaceholder="Cari Paket Soal..." session={session}><KaptenPackageBuilderPageModule id={packageId} initialDraft={initialDraft} sourceCatalog={sourceCatalog} /></MentorWorkspaceShell>;
}

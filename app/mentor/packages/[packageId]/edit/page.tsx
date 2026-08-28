import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getReusableQuestionPackageVersionHub } from "@/lib/tryout/repository";
import { KaptenPackageMetadataEditorModule } from "@/modules/mentor/KaptenPackageMetadataEditorModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Edit Paket Soal Kapten | Vecalss LMS" };

export default async function PackageEditPage({ params }: { params: Promise<{ packageId: string }> }) {
  const [{ packageId }, session] = await Promise.all([params, requireTutorSession()]);
  const hub = await getReusableQuestionPackageVersionHub(packageId, session.user.id);
  if (!hub) notFound();
  return <MentorWorkspaceShell activeLabel="Paket Soal" breadcrumbLabel="Edit Paket Soal" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Paket Soal..." session={session} showSearch={false} sidebarAppearance="reference"><KaptenPackageMetadataEditorModule initialMetadata={hub} /></MentorWorkspaceShell>;
}

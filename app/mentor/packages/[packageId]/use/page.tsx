import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getReusableQuestionPackageUseContext } from "@/lib/tryout/repository";
import { KaptenPackageUsePageModule } from "@/modules/mentor/KaptenPackageUsePageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Gunakan Paket Soal di Tryout | Vecalss LMS" };

export default async function PackageUsePage({ params }: { params: Promise<{ packageId: string }> }) {
  const [{ packageId }, session] = await Promise.all([params, requireTutorSession()]);
  const context = await getReusableQuestionPackageUseContext(packageId, session.user.id);
  if (!context) notFound();

  return <MentorWorkspaceShell activeLabel="Paket Soal" breadcrumbLabel="Gunakan di Tryout" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Paket Soal..." session={session} showSearch={false}><KaptenPackageUsePageModule context={context} /></MentorWorkspaceShell>;
}

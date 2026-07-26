import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getReusableQuestionPackageVersionHub } from "@/lib/tryout/repository";
import { KaptenPackageVersionHubModule } from "@/modules/mentor/KaptenPackageVersionHubModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Versi Paket Soal Kapten | Vecalss LMS" };

export default async function PackageVersionHubPage({ params }: { params: Promise<{ packageId: string }> }) {
  const [{ packageId }, session] = await Promise.all([params, requireTutorSession()]);
  const hub = await getReusableQuestionPackageVersionHub(packageId, session.user.id);
  if (!hub) notFound();

  return <MentorWorkspaceShell activeLabel="Paket Soal" breadcrumbLabel="Versi Paket" mainClassName="max-w-none" searchPlaceholder="Cari Paket Soal..." session={session}><KaptenPackageVersionHubModule hub={hub} /></MentorWorkspaceShell>;
}

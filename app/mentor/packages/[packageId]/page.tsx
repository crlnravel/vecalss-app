import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getReusableQuestionPackageVersionHub } from "@/lib/tryout/repository";
import { KaptenPackageVersionHubModule } from "@/modules/mentor/KaptenPackageVersionHubModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Paket Soal Kapten | Vecalss LMS" };

export default async function PackageVersionHubPage({ params, searchParams }: { params: Promise<{ packageId: string }>; searchParams: Promise<{ released?: string; saved?: string }> }) {
  const [{ packageId }, query, session] = await Promise.all([params, searchParams, requireTutorSession()]);
  const hub = await getReusableQuestionPackageVersionHub(packageId, session.user.id);
  if (!hub) notFound();

  return <MentorWorkspaceShell activeLabel="Paket Soal" breadcrumbLabel="Ikhtisar Paket" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Paket Soal..." session={session} showBreadcrumb={false} showSearch={false} sidebarAppearance="reference"><KaptenPackageVersionHubModule feedback={{ released: query.released === "1", savedDraft: query.saved === "draft" }} hub={hub} /></MentorWorkspaceShell>;
}

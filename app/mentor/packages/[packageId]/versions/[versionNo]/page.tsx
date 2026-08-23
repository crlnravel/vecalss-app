import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getReusableQuestionPackageVersionDetail } from "@/lib/tryout/repository";
import { KaptenPackageVersionDetailModule } from "@/modules/mentor/KaptenPackageVersionDetailModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Snapshot Versi Paket Soal | Vecalss LMS" };

export default async function PackageVersionDetailPage({ params }: { params: Promise<{ packageId: string; versionNo: string }> }) {
  const [{ packageId, versionNo: rawVersionNo }, session] = await Promise.all([params, requireTutorSession()]);
  const versionNo = Number(rawVersionNo);
  if (!Number.isInteger(versionNo) || versionNo < 1) notFound();
  const detail = await getReusableQuestionPackageVersionDetail(packageId, versionNo, session.user.id);
  if (!detail) notFound();
  return <MentorWorkspaceShell activeLabel="Paket Soal" breadcrumbLabel={`Paket v${versionNo}`} contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Paket Soal..." session={session} showSearch={false}><KaptenPackageVersionDetailModule detail={detail} /></MentorWorkspaceShell>;
}

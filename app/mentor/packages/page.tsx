import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { listReusableQuestionPackages } from "@/lib/tryout/repository";
import { KaptenPackageCataloguePageModule } from "@/modules/mentor/KaptenPackageCataloguePageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Paket Soal Kapten | Vecalss LMS" };

export default async function PackagePage({ searchParams }: PageProps<"/mentor/packages">) {
  const [params, session] = await Promise.all([
    searchParams,
    requireTutorSession(),
  ]);
  const query = typeof params.q === "string" ? params.q : "";
  const status = params.status === "draft" || params.status === "ready" ? params.status : undefined;
  const subtest = typeof params.subtest === "string" ? params.subtest : "";
  const rawPage = typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  const catalogue = await listReusableQuestionPackages(session.user.id, { page: Number.isFinite(rawPage) ? rawPage : 1, query, status, subtest });

  return <MentorWorkspaceShell activeLabel="Paket Soal" breadcrumbLabel="Paket Soal" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Paket Soal..." session={session} showSearch={false}><KaptenPackageCataloguePageModule {...catalogue} query={query} status={status ?? ""} subtest={subtest} /></MentorWorkspaceShell>;
}

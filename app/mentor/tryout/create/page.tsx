import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { listReadyPackageVersions } from "@/lib/tryout/repository";
import { KaptenTryoutBuilderPageModule } from "@/modules/mentor/KaptenTryoutBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Buat Tryout Kapten | Vecalss LMS" };

export default async function CreateTryoutPage() {
  const session = await requireTutorSession();
  const readyVersions = await listReadyPackageVersions(session.user.id);
  return <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Buat Tryout" searchPlaceholder="Cari Tryout..." session={session}><KaptenTryoutBuilderPageModule readyVersions={readyVersions} session={session} /></MentorWorkspaceShell>;
}

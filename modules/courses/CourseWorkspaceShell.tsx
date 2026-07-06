"use client";

import type { SessionContext } from "@/lib/auth/types";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";

function CourseWorkspaceShell({
  activeLabel,
  breadcrumbLabel,
  children,
  searchPlaceholder = "Cari materi, video, atau topik...",
  session,
}: {
  activeLabel: string;
  breadcrumbLabel: string;
  children: React.ReactNode;
  searchPlaceholder?: string;
  session: SessionContext;
}) {
  return (
    <StudentWorkspaceShell
      activeLabel={activeLabel}
      breadcrumbLabel={breadcrumbLabel}
      searchPlaceholder={searchPlaceholder}
      session={session}
      sidebarFooterLabel="Ruang kerja siswa"
    >
      {children}
    </StudentWorkspaceShell>
  );
}

export { CourseWorkspaceShell };

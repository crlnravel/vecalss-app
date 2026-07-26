"use client";

import type { SessionContext } from "@/lib/auth/types";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";

function CourseWorkspaceShell({
  activeLabel,
  breadcrumbLabel,
  children,
  mainClassName,
  searchPlaceholder = "Cari materi, video, atau topik...",
  showSearch = true,
  session,
}: {
  activeLabel: string;
  breadcrumbLabel: string;
  children: React.ReactNode;
  mainClassName?: string;
  searchPlaceholder?: string;
  showSearch?: boolean;
  session: SessionContext;
}) {
  return (
    <StudentWorkspaceShell
      activeLabel={activeLabel}
      breadcrumbLabel={breadcrumbLabel}
      mainClassName={mainClassName}
      searchPlaceholder={searchPlaceholder}
      showSearch={showSearch}
      session={session}
    >
      {children}
    </StudentWorkspaceShell>
  );
}

export { CourseWorkspaceShell };

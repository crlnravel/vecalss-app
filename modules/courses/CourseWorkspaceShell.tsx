"use client";

import type { SessionContext } from "@/lib/auth/types";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";

function CourseWorkspaceShell({
  activeLabel,
  breadcrumbLabel,
  children,
  mainClassName,
  searchPlaceholder = "Cari materi, video, atau topik...",
  session,
}: {
  activeLabel: string;
  breadcrumbLabel: string;
  children: React.ReactNode;
  mainClassName?: string;
  searchPlaceholder?: string;
  session: SessionContext;
}) {
  return (
    <StudentWorkspaceShell
      activeLabel={activeLabel}
      breadcrumbLabel={breadcrumbLabel}
      mainClassName={mainClassName}
      searchPlaceholder={searchPlaceholder}
      session={session}
    >
      {children}
    </StudentWorkspaceShell>
  );
}

export { CourseWorkspaceShell };

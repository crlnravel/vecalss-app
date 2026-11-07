"use client";

import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";

function CourseWorkspaceShell({
  activeLabel,
  breadcrumbLabel,
  children,
  fillViewport,
  mainClassName,
  notificationFeed,
  searchPlaceholder = "Cari materi, bacaan, atau topik...",
  showSearch = true,
  session,
}: {
  activeLabel: string;
  breadcrumbLabel: string;
  children: React.ReactNode;
  fillViewport?: boolean;
  mainClassName?: string;
  notificationFeed?: StudentNotificationFeed;
  searchPlaceholder?: string;
  showSearch?: boolean;
  session: SessionContext;
}) {
  return (
    <StudentWorkspaceShell
      activeLabel={activeLabel}
      breadcrumbLabel={breadcrumbLabel}
      fillViewport={fillViewport}
      mainClassName={mainClassName}
      notificationFeed={notificationFeed}
      searchPlaceholder={searchPlaceholder}
      showSearch={showSearch}
      session={session}
    >
      {children}
    </StudentWorkspaceShell>
  );
}

export { CourseWorkspaceShell };

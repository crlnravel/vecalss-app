"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed, StudentNotificationItem } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";
import { useStudentNotifications } from "@/modules/student/use-student-notifications";
import {
  StudentAccountMenu,
  type StudentAccountMenuItem,
} from "@/modules/student/components/student-account-menu";
import {
  StudentNotificationPopover,
} from "@/modules/student/components/student-notification-popover";
import { StudentSidebar } from "@/modules/student/components/student-sidebar";

const studentRootHrefByLabel: Record<string, string> = {
  Beranda: "/dashboard",
  Materi: "/courses",
  Kuis: "/quiz",
  Tryout: "/tryout",
  "Vera AI": "/vera-ai",
  Notifikasi: "/notifications",
  Profil: "/settings",
};

function StudentWorkspaceShell({
  accountMenuExtraItem,
  activeLabel,
  breadcrumbLabel,
  children,
  mainClassName,
  notificationFeed,
  notificationItems,
  notificationUnreadCount,
  session,
}: {
  accountMenuExtraItem?: StudentAccountMenuItem;
  activeLabel: string;
  breadcrumbLabel: string;
  children: React.ReactNode;
  mainClassName?: string;
  notificationFeed?: StudentNotificationFeed;
  notificationItems?: StudentNotificationItem[];
  notificationUnreadCount?: number;
  searchPlaceholder?: string;
  showSearch?: boolean;
  session: SessionContext;
}) {
  const liveNotificationFeed = useStudentNotifications(notificationFeed?.items ?? notificationItems, {
    initialUnreadCount: notificationFeed?.unreadCount ?? notificationUnreadCount,
  });
  const liveNotificationItems = liveNotificationFeed.items;
  const unreadNotificationCount = liveNotificationFeed.unreadCount;
  const rootHref = studentRootHrefByLabel[activeLabel] ?? "/dashboard";
  const isRootPage = breadcrumbLabel === activeLabel;

  return (
    <SidebarProvider className="!bg-voyage-canvas lg:gap-2 lg:p-6">
      <div className="flex min-h-svh w-full bg-voyage-canvas text-secondary-900 lg:gap-2">
        <StudentSidebar
          activeLabel={activeLabel}
          notificationBadge={
            unreadNotificationCount === 0
              ? undefined
              : String(unreadNotificationCount)
          }
        />

        <SidebarInset className="min-h-svh min-w-0 bg-voyage-canvas lg:rounded-3xl">
          <header className="sticky top-0 z-20 mx-auto w-full max-w-[1420px] border-primary-100/80 bg-voyage-canvas/90 backdrop-blur-xl lg:top-6 lg:rounded-3xl lg:border">
            <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="shrink-0 lg:hidden" />

              <div className="hidden min-w-0 flex-1 md:block">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href={rootHref} className="text-secondary-500">
                        {activeLabel}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    {!isRootPage ? (
                      <>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
                        </BreadcrumbItem>
                      </>
                    ) : null}
                  </BreadcrumbList>
                </Breadcrumb>
              </div>

              <StudentNotificationPopover items={liveNotificationItems.slice(0, 5)} unreadCount={unreadNotificationCount} />

          <StudentAccountMenu
            extraItem={accountMenuExtraItem}
            session={session}
          />
            </div>
          </header>

          <main
            className={cn(
              "mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10",
              mainClassName,
            )}
          >
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export { StudentWorkspaceShell };

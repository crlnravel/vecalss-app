"use client";

import { Search } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import {
  StudentAccountMenu,
  type StudentAccountMenuItem,
} from "@/modules/student/components/student-account-menu";
import {
  StudentNotificationPopover,
  type StudentNotificationItem,
} from "@/modules/student/components/student-notification-popover";
import { StudentSidebar } from "@/modules/student/components/student-sidebar";
import { studentNotificationItems } from "@/modules/student/notification-data";

function StudentWorkspaceShell({
  accountMenuExtraItem = "home",
  activeLabel,
  breadcrumbLabel,
  children,
  dailyMissionBadge,
  mainClassName,
  notificationItems = studentNotificationItems,
  searchPlaceholder = "Cari materi, video, atau topik...",
  session,
  sidebarFooterLabel,
}: {
  accountMenuExtraItem?: StudentAccountMenuItem;
  activeLabel: string;
  breadcrumbLabel: string;
  children: React.ReactNode;
  dailyMissionBadge?: string;
  mainClassName?: string;
  notificationItems?: StudentNotificationItem[];
  searchPlaceholder?: string;
  session: SessionContext;
  sidebarFooterLabel: string;
}) {
  const unreadNotificationCount = notificationItems?.filter(
    (item) => item.unread,
  ).length;

  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full bg-[#f7faf8] text-secondary-900">
        <StudentSidebar
          activeLabel={activeLabel}
          dailyMissionBadge={dailyMissionBadge}
          footerLabel={sidebarFooterLabel}
          fullName={session.user.fullName}
          notificationBadge={
            unreadNotificationCount === undefined || unreadNotificationCount === 0
              ? undefined
              : String(unreadNotificationCount)
          }
        />

        <SidebarInset className="bg-transparent">
          <header className="sticky top-0 z-20 border-b border-primary-100/80 bg-[#f7faf8]/90 backdrop-blur-xl">
            <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="shrink-0" />

              <div className="hidden min-w-0 flex-1 md:block">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href="/" className="text-secondary-500">
                        Vecalss
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>

              <div className="relative ml-auto hidden w-full max-w-sm md:block">
                <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-secondary-400" />
                <Input
                  aria-label={searchPlaceholder}
                  className="h-10 rounded-full border-primary-100 bg-white pl-10 shadow-sm"
                  placeholder={searchPlaceholder}
                />
              </div>

              <StudentNotificationPopover items={notificationItems} />

              <StudentAccountMenu
                extraItem={accountMenuExtraItem}
                session={session}
              />
            </div>
          </header>

          <ScrollArea className="h-[calc(100svh-4rem)]">
            <main
              className={cn(
                "mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10",
                mainClassName,
              )}
            >
              {children}
            </main>
          </ScrollArea>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export { StudentWorkspaceShell };

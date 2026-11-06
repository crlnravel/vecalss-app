"use client";

import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionContext } from "@/lib/auth/types";
import { History } from "@/lib/icons";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import type { VeraUsageSnapshot } from "@/lib/vera/ledger";
import { BrandMark } from "@/modules/home/components/home-primitives";
import { StudentAccountMenu } from "@/modules/student/components/student-account-menu";
import { StudentNotificationPopover } from "@/modules/student/components/student-notification-popover";
import { useStudentNotifications } from "@/modules/student/use-student-notifications";
import { VeraUsagePopover } from "@/modules/vera/VeraUsagePopover";

/**
 * The slim top bar, flush to the edges with no card or border: the PTN Pro mark and wordmark, the sessions button, a divider, and the
 * breadcrumb. Usage, notifications and the account menu sit on the right. On phones the breadcrumb and the desktop notifications hide.
 */
export function VeraWorkspaceHeader({
  notificationFeed,
  onOpenSessions,
  onRefreshUsage,
  session,
  usage,
}: {
  notificationFeed: StudentNotificationFeed;
  onOpenSessions: () => void;
  onRefreshUsage: () => void;
  session: SessionContext;
  usage: VeraUsageSnapshot;
}) {
  const feed = useStudentNotifications(notificationFeed.items, { initialUnreadCount: notificationFeed.unreadCount });

  return (
    <header className="flex h-[4.25rem] shrink-0 items-center justify-between gap-3 px-4 md:px-8">
      <div className="flex min-w-0 items-center gap-3 md:gap-4">
        <Link
          aria-label="Ke beranda PTN Pro"
          className="flex shrink-0 items-center gap-2 rounded-control focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          href="/dashboard"
        >
          <BrandMark compact />
          <span className="font-logo hidden text-[1.4rem] leading-none tracking-[0.08em] text-primary-700 md:block">
            PTN PRO
          </span>
        </Link>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button aria-label="Buka daftar sesi" onClick={onOpenSessions} size="icon" type="button" variant="quiet" />
            }
          >
            <History />
          </TooltipTrigger>
          <TooltipContent>Daftar sesi</TooltipContent>
        </Tooltip>
        <span aria-hidden="true" className="hidden h-6 w-px bg-primary-100 md:block" />
        <Breadcrumb className="hidden min-w-0 md:block">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink className="text-secondary-500" href="/dashboard">
                Beranda
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Vera AI</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
        <VeraUsagePopover onOpen={onRefreshUsage} usage={usage} />
        <span className="hidden md:block">
          <StudentNotificationPopover items={feed.items.slice(0, 5)} unreadCount={feed.unreadCount} />
        </span>
        <StudentAccountMenu extraItem="notifications" session={session} />
      </div>
    </header>
  );
}

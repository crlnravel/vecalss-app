"use client";

import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionContext } from "@/lib/auth/types";
import { History, X } from "@/lib/icons";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import type { VeraUsageSnapshot } from "@/lib/vera/ledger";
import { StudentAccountMenu } from "@/modules/student/components/student-account-menu";
import { StudentNotificationPopover } from "@/modules/student/components/student-notification-popover";
import { useStudentNotifications } from "@/modules/student/use-student-notifications";
import { VeraUsagePopover } from "@/modules/vera/VeraUsagePopover";

const MASCOT_SRC = "/brand/mascot-vecalss-2.png";

/**
 * The header over the centre column, as Aily has it: a round X that leaves the page, the Vera mascot and its title. On the right, the
 * notifications and the account menu. Below lg the header also holds the history button and the usage pill, which open the same panel
 * and usage body as the right panel.
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
    <header className="flex h-18 shrink-0 items-center justify-between gap-3 px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button aria-label="Keluar ke beranda" render={<Link href="/dashboard" />} size="icon" variant="quiet">
          <X />
        </Button>
        <span aria-hidden="true" className="relative size-7 shrink-0">
          <Image alt="" className="object-contain" fill sizes="28px" src={MASCOT_SRC} />
        </span>
        <h1 className="font-heading truncate text-xl font-extrabold tracking-[-0.035em] text-voyage-ink">Vera AI</h1>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="Buka daftar sesi"
                className="lg:hidden"
                onClick={onOpenSessions}
                size="icon"
                type="button"
                variant="quiet"
              />
            }
          >
            <History />
          </TooltipTrigger>
          <TooltipContent>Daftar sesi</TooltipContent>
        </Tooltip>
        <VeraUsagePopover className="lg:hidden" onOpen={onRefreshUsage} usage={usage} />
        <span className="hidden md:block">
          <StudentNotificationPopover items={feed.items.slice(0, 5)} unreadCount={feed.unreadCount} />
        </span>
        <StudentAccountMenu extraItem="notifications" session={session} />
      </div>
    </header>
  );
}

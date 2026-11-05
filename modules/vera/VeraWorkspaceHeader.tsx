"use client";

import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SessionContext } from "@/lib/auth/types";
import { Menu } from "@/lib/icons";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import type { VeraUsageSnapshot } from "@/lib/vera/ledger";
import { StudentAccountMenu } from "@/modules/student/components/student-account-menu";
import { StudentNotificationPopover } from "@/modules/student/components/student-notification-popover";
import { useStudentNotifications } from "@/modules/student/use-student-notifications";
import { VeraUsagePopover } from "@/modules/vera/VeraUsagePopover";

const MASCOT_SRC = "/brand/mascot-vecalss-2.png";

/**
 * The workspace header: the way back, the mascot and title, Chat and Studio, then usage, notifications and the account menu.
 * It keeps the floating treatment of the student shell. On phones, the tabs move to a second row of equal-width buttons.
 */
export function VeraWorkspaceHeader({
  notificationFeed,
  onOpenSessions,
  onRefreshUsage,
  returnHref,
  returnLabel,
  session,
  usage,
}: {
  notificationFeed: StudentNotificationFeed;
  onOpenSessions: () => void;
  onRefreshUsage: () => void;
  returnHref: string;
  returnLabel: string;
  session: SessionContext;
  usage: VeraUsageSnapshot;
}) {
  const feed = useStudentNotifications(notificationFeed.items, { initialUnreadCount: notificationFeed.unreadCount });

  return (
    <header className="flex-none rounded-control border border-primary-100/80 bg-[rgba(247,250,248,0.58)] shadow-[0_18px_40px_-28px_color-mix(in_oklab,var(--voyage-deep)_38%,transparent)] backdrop-blur-3xl backdrop-saturate-150">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 px-2 py-2 md:flex-nowrap md:gap-3 md:px-4 md:py-2.5 lg:px-5">
        <Button
          aria-label={`Kembali ke ${returnLabel}`}
          className="shrink-0 px-3 md:px-4"
          render={<Link href={returnHref} />}
          variant="outline"
        >
          Kembali
        </Button>
        <span className="relative hidden size-[28px] shrink-0 overflow-hidden rounded-pill border border-primary-100 bg-white md:block">
          <Image alt="" className="object-contain" fill sizes="28px" src={MASCOT_SRC} />
        </span>
        <h1 className="min-w-0 flex-1 truncate font-heading text-[1.25rem] leading-tight font-extrabold tracking-[-0.035em] text-voyage-ink md:flex-none md:shrink-0">
          Vera AI
        </h1>
        <TabsList
          aria-label="Bagian Vera"
          className="order-last w-full md:order-none md:w-auto md:flex-1 md:justify-center"
          layout="equal"
        >
          <TabsTrigger className="md:w-fit md:flex-none md:px-5" layout="equal" value="chat">
            Chat
          </TabsTrigger>
          <TabsTrigger className="md:w-fit md:flex-none md:px-5" layout="equal" value="studio">
            Studio
          </TabsTrigger>
        </TabsList>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 md:gap-2">
          <Button
            aria-label="Buka daftar sesi"
            className="md:hidden"
            onClick={onOpenSessions}
            size="icon"
            type="button"
            variant="quiet"
          >
            <Menu />
          </Button>
          <VeraUsagePopover onOpen={onRefreshUsage} usage={usage} />
          <span className="hidden md:block">
            <StudentNotificationPopover items={feed.items.slice(0, 5)} unreadCount={feed.unreadCount} />
          </span>
          <StudentAccountMenu extraItem="notifications" session={session} />
        </div>
      </div>
    </header>
  );
}

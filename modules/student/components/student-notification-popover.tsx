"use client";

import Link from "next/link";
import { useStudentNotifications } from "@/modules/student/use-student-notifications";
import { Bell } from "@/lib/icons";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { StudentBadge } from "@/components/ui/student-badge";
import type { StudentNotificationItem } from "@/lib/notifications/types";

const EMPTY_NOTIFICATION_ITEMS: StudentNotificationItem[] = [];

function StudentNotificationPopover({
  items,
  unreadCount,
}: {
  items?: StudentNotificationItem[];
  unreadCount?: number;
}) {
  const liveFeed = useStudentNotifications(items ?? EMPTY_NOTIFICATION_ITEMS, { initialUnreadCount: unreadCount });
  const renderedItems = liveFeed.items;
  const renderedUnreadCount = unreadCount ?? liveFeed.unreadCount;

  if (renderedItems.length === 0) {
    return (
      <Button aria-label="Notifikasi" nativeButton={false} render={<Link href="/notifications" />} size="icon-sm" variant="ghost">
        <Bell />
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label="Notifikasi"
            className="relative"
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <Bell />
        {renderedUnreadCount > 0 ? (
          <StudentBadge
            className="absolute -top-1 -right-1 h-5 min-w-5 border-2 border-white px-1 text-ui-xs"
            size="xs"
            tone="attention"
          >
            {renderedUnreadCount}
          </StudentBadge>
        ) : null}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[360px] gap-0 p-0"
        sideOffset={8}
      >
        <PopoverHeader className="gap-1 border-b border-primary-100 px-4 py-4">
          <div className="min-w-0">
            <PopoverTitle>Notifikasi</PopoverTitle>
          </div>
        </PopoverHeader>

        <div className="flex flex-col">
          {renderedItems.map((item, index) => {
            const entry = (
              <>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-secondary-900">
                      {item.title}
                    </p>
                    {item.unread ? (
                      <span className="size-2 shrink-0 rounded-full bg-student-status-attention-border" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-secondary-600">
                    {item.detail}
                  </p>
                  <span className="mt-3 block text-xs text-secondary-500">
                    {item.time}
                  </span>
                </div>
              </>
            );

            return (
              <div key={item.id}>
                <Link
                  href={`/notifications/${item.id}`}
                  className="flex gap-3 px-4 py-4 transition-colors hover:bg-primary-50/80"
                  prefetch={false}
                >
                  {entry}
                </Link>
                {index < renderedItems.length - 1 ? (
                  <Separator className="bg-primary-100/80" />
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="border-t border-primary-100 px-4 py-3">
          <Button
            className="h-auto w-auto justify-start px-0 py-0 text-sm font-medium text-secondary-700 hover:bg-transparent hover:text-secondary-700"
            nativeButton={false}
            render={<Link href="/notifications" />}
            variant="ghost"
          >
            Lihat semua
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { StudentNotificationPopover };
export type { StudentNotificationItem };

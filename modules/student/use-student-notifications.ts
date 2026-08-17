"use client";

import type { StudentNotificationFeed, StudentNotificationItem } from "@/lib/notifications/types";

const EMPTY_ITEMS: StudentNotificationItem[] = [];

function useStudentNotifications(
  initialItems: StudentNotificationItem[] = EMPTY_ITEMS,
  {
    initialUnreadCount,
  }: {
    initialUnreadCount?: number;
  } = {},
) {
  return {
    items: initialItems,
    unreadCount: initialUnreadCount ?? initialItems.filter((item) => item.unread).length,
  } satisfies StudentNotificationFeed;
}

export { useStudentNotifications };

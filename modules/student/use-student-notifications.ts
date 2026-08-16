"use client";

import { useEffect, useState } from "react";

import type { StudentNotificationItem } from "@/lib/notifications/types";

const EMPTY_ITEMS: StudentNotificationItem[] = [];

type NotificationFeedResponse = {
  items?: unknown;
  unreadCount?: unknown;
};

type StudentNotificationFeed = {
  items: StudentNotificationItem[];
  unreadCount: number;
};

function isStudentNotificationItem(value: unknown): value is StudentNotificationItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  return typeof item.detail === "string"
    && typeof item.external === "boolean"
    && typeof item.href === "string"
    && typeof item.id === "string"
    && typeof item.time === "string"
    && typeof item.title === "string"
    && typeof item.unread === "boolean";
}

function useStudentNotifications(
  initialItems: StudentNotificationItem[] = EMPTY_ITEMS,
  {
    enabled = true,
    initialUnreadCount,
    limit = 20,
  }: {
    enabled?: boolean;
    initialUnreadCount?: number;
    limit?: number;
  } = {},
) {
  const [fetchedFeed, setFetchedFeed] = useState<StudentNotificationFeed | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    async function loadNotifications() {
      try {
        const response = await fetch(`/api/notifications?limit=${encodeURIComponent(String(limit))}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) {
          return;
        }

        const payload = await response.json() as NotificationFeedResponse;
        const nextItems = Array.isArray(payload.items)
          ? payload.items.filter(isStudentNotificationItem)
          : null;
        const nextUnreadCount = typeof payload.unreadCount === "number" && Number.isFinite(payload.unreadCount)
          ? Math.max(0, Math.floor(payload.unreadCount))
          : null;

        if (!cancelled && nextItems && nextUnreadCount !== null) {
          setFetchedFeed({ items: nextItems, unreadCount: nextUnreadCount });
        }
      } catch {
        // The server-rendered feed remains visible when a background refresh fails.
      }
    }

    void loadNotifications();

    return () => {
      cancelled = true;
    };
  }, [enabled, initialItems, limit]);

  if (enabled && fetchedFeed !== null) {
    return fetchedFeed;
  }

  return {
    items: initialItems,
    unreadCount: initialUnreadCount ?? initialItems.filter((item) => item.unread).length,
  } satisfies StudentNotificationFeed;
}

export { useStudentNotifications };

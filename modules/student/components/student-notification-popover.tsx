"use client";

import Link from "next/link";
import type { ComponentType } from "react";
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
import { cn } from "@/lib/utils";

type StudentNotificationItem = {
  detail: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  time: string;
  title: string;
  unread: boolean;
};

function StudentNotificationPopover({
  items = [],
}: {
  items?: StudentNotificationItem[];
}) {
  const unreadCount = items.filter((item) => item.unread).length;

  if (items.length === 0) {
    return (
      <Button aria-label="Notifikasi" size="icon-sm" variant="ghost">
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
        {unreadCount > 0 ? (
          <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-[#F5C518] px-1 py-0.5 text-xs leading-none font-semibold text-secondary-900">
            {unreadCount}
          </span>
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
          {items.map((item, index) => (
            <div key={item.title}>
              <Link
                href={item.href}
                className="flex gap-3 px-4 py-4 transition-colors hover:bg-primary-50/80"
              >
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-2xl border",
                    item.unread
                      ? "border-primary-200 bg-primary-100 text-primary-800"
                      : "border-primary-100 bg-white text-secondary-500",
                  )}
                >
                  <item.icon />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-secondary-900">
                      {item.title}
                    </p>
                    {item.unread ? (
                      <span className="size-2 shrink-0 rounded-full bg-[#F5C518]" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-secondary-600">
                    {item.detail}
                  </p>
                  <span className="mt-3 block text-xs text-secondary-500">
                    {item.time}
                  </span>
                </div>
              </Link>
              {index < items.length - 1 ? (
                <Separator className="bg-primary-100/80" />
              ) : null}
            </div>
          ))}
        </div>

        <div className="border-t border-primary-100 px-4 py-3">
          <Button
            className="h-auto w-auto justify-start px-0 py-0 text-sm font-medium text-secondary-700 hover:bg-transparent hover:text-secondary-700"
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

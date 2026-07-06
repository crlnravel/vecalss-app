"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";
import { studentNotificationItems } from "@/modules/student/notification-data";

function NotificationsPageModule({
  session,
}: {
  session: SessionContext;
}) {
  const items = studentNotificationItems;

  return (
    <StudentWorkspaceShell
      activeLabel="Notifikasi"
      breadcrumbLabel="Notifikasi"
      searchPlaceholder="Cari notifikasi atau update belajar..."
      session={session}
      sidebarFooterLabel="Ruang kerja siswa"
    >
      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-4xl leading-tight font-semibold text-secondary-900 md:text-5xl">
              Notifikasi
            </h1>
          </div>
          <Button size="sm" type="button" variant="ghost">
            Tandai sudah dibaca
          </Button>
        </div>

        <div className="grid gap-4">
          {items.map((item) => (
            <Link
              key={`${item.title}-${item.time}`}
              href={item.href}
              className="flex items-start gap-4 rounded-2xl border border-primary-100 bg-white px-5 py-4 transition-colors hover:bg-primary-50/40"
            >
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl border",
                  item.unread
                    ? "border-primary-200 bg-primary-50 text-primary-800"
                    : "border-primary-100 bg-white text-secondary-500",
                )}
              >
                <item.icon className="size-4.5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-secondary-900">
                    {item.title}
                  </p>
                  {item.unread ? (
                    <span className="size-2 rounded-full bg-[#F5C518]" />
                  ) : null}
                </div>
                <p className="mt-1 text-sm leading-6 text-secondary-600">
                  {item.detail}
                </p>
                <p className="mt-2 text-xs text-secondary-500">{item.time}</p>
              </div>

              <ChevronRight className="mt-1 hidden size-4 text-secondary-400 md:block" />
            </Link>
          ))}
        </div>
      </section>
    </StudentWorkspaceShell>
  );
}

export { NotificationsPageModule };

"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import type { StudentNotificationItem } from "@/modules/student/components/student-notification-popover";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";

function NotificationsPageModule({
  items,
  session,
}: {
  items: StudentNotificationItem[];
  session: SessionContext;
}) {
  const unreadCount = items.filter((item) => item.unread).length;

  return (
    <StudentWorkspaceShell
      activeLabel="Notifications"
      breadcrumbLabel="Notifications"
      searchPlaceholder="Cari notifikasi atau update belajar..."
      session={session}
      sidebarFooterLabel="Student workspace"
    >
      <section className="flex flex-col gap-6">
        <Card className="overflow-hidden rounded-[30px] border border-primary-100 bg-[linear-gradient(135deg,rgba(1,76,56,0.18)_0%,rgba(1,76,56,0.08)_45%,rgba(255,245,204,0.9)_100%)] shadow-[0_28px_90px_-58px_rgba(1,76,56,0.28)]">
          <CardHeader className="gap-4 px-6 py-7 md:px-8 md:py-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="text-[32px] leading-tight font-semibold text-secondary-900 md:text-[42px]">
                  Notifications
                </CardTitle>
                <CardDescription className="mt-3 max-w-[60ch] text-[15px] leading-7 text-secondary-600 md:text-base">
                  Lihat semua update penting tentang progress belajar, kelas
                  live, dan insight terbaru dari Vera AI.
                </CardDescription>
              </div>
              <div className="rounded-[24px] border border-white/75 bg-white/85 px-5 py-4 shadow-sm">
                <p className="text-xs font-semibold tracking-[0.14em] text-secondary-500 uppercase">
                  Belum dibaca
                </p>
                <p className="mt-2 text-3xl font-semibold text-secondary-900">
                  {unreadCount}
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-4">
          {items.map((item) => (
            <Link key={`${item.title}-${item.time}`} href={item.href}>
              <Card className="rounded-[28px] border border-primary-100 bg-white shadow-[0_18px_52px_-40px_rgba(1,76,56,0.32)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-[0_24px_62px_-42px_rgba(1,76,56,0.4)]">
                <CardContent className="flex gap-4 px-5 py-5 md:px-6 md:py-6">
                  <div
                    className={cn(
                      "flex size-12 shrink-0 items-center justify-center rounded-2xl border",
                      item.unread
                        ? "border-primary-200 bg-primary-100 text-primary-800"
                        : "border-primary-100 bg-white text-secondary-500",
                    )}
                  >
                    <item.icon className="size-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-secondary-900">
                        {item.title}
                      </p>
                      {item.unread ? (
                        <span className="size-2 rounded-full bg-[#F5C518]" />
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-secondary-600">
                      {item.detail}
                    </p>
                    <p className="mt-3 text-xs font-medium text-secondary-500">
                      {item.time}
                    </p>
                  </div>

                  <div className="hidden items-center md:flex">
                    <ChevronRight className="size-5 text-secondary-400" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="flex justify-start">
          <Button render={<Link href="/dashboard" />} variant="ghost">
            Kembali ke dashboard
          </Button>
        </div>
      </section>
    </StudentWorkspaceShell>
  );
}

export { NotificationsPageModule };

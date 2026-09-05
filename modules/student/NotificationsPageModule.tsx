import Link from "next/link";
import { Bell, ChevronRight } from "@/lib/icons";

import { Button } from "@/components/ui/button";
import {
  ReferenceEmptyState,
  ReferencePageHeader,
} from "@/components/dashboard";
import { REFERENCE_SURFACE_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { StudentBadge } from "@/components/ui/student-badge";
import { cn } from "@/lib/utils";
import type { StudentNotificationItem } from "@/lib/notifications/types";
import type { SessionContext } from "@/lib/auth/types";
import { markAllNotificationsReadAction } from "@/modules/student/actions";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";

function NotificationEntry({ item }: { item: StudentNotificationItem }) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-secondary-900">
            {item.title}
          </p>
          {item.unread ? (
            <>
              <StudentBadge size="xs" tone="attention">
                Belum dibaca
              </StudentBadge>
              <span aria-hidden="true" className="size-2 rounded-full bg-student-status-attention-border" />
            </>
          ) : null}
        </div>
        <p className="mt-1 text-sm leading-6 text-secondary-600">
          {item.detail}
        </p>
        <p className="mt-2 text-xs text-secondary-500">{item.time}</p>
      </div>

      <ChevronRight aria-hidden="true" className="mt-1 hidden size-4 text-secondary-400 md:block" />
    </>
  );

  return (
    <Link
      className={cn(
        REFERENCE_SURFACE_CLASS_NAMES.raised,
        REFERENCE_SURFACE_CLASS_NAMES.raisedInteractive,
        "group flex items-start gap-4 px-5 py-4 focus-visible:ring-3 focus-visible:ring-primary-300/35",
      )}
      href={`/notifications/${item.id}`}
      prefetch={false}
    >
      {content}
    </Link>
  );
}

function NotificationsPageModule({
  items,
  session,
  unreadCount,
}: {
  items: StudentNotificationItem[];
  session: SessionContext;
  unreadCount: number;
}) {
  const hasUnread = unreadCount > 0;

  return (
    <StudentWorkspaceShell
      activeLabel="Notifikasi"
      breadcrumbLabel="Notifikasi"
      notificationItems={items}
      notificationUnreadCount={unreadCount}
      searchPlaceholder="Cari notifikasi atau update belajar..."
      session={session}
    >
      <section className="flex flex-col gap-5">
        <ReferencePageHeader
          actions={
            <form action={markAllNotificationsReadAction}>
              <Button disabled={!hasUnread} size="default" type="submit" variant="ghost">
                Tandai sudah dibaca
              </Button>
            </form>
          }
          title="Notifikasi"
        />

        {items.length > 0 ? (
          <div className="grid gap-4">
            {items.map((item) => <NotificationEntry item={item} key={item.id} />)}
          </div>
        ) : (
          <ReferenceEmptyState
            className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "overflow-hidden")}
            description="Update dari kelas dan aktivitas belajar akan muncul di sini."
            icon={Bell}
            title="Belum ada notifikasi"
          />
        )}
      </section>
    </StudentWorkspaceShell>
  );
}

export { NotificationsPageModule };

import Link from "next/link";
import { ChevronRight } from "@/lib/icons";

import { Button } from "@/components/ui/button";
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
            <span aria-label="Belum dibaca" className="size-2 rounded-full bg-student-status-attention-border" />
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
      className="flex items-start gap-4 rounded-2xl border border-primary-100 bg-white px-5 py-4 transition-colors hover:bg-primary-50/40"
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-4xl leading-tight font-semibold text-secondary-900 md:text-5xl">
              Notifikasi
            </h1>
          </div>
          <form action={markAllNotificationsReadAction}>
            <Button disabled={!hasUnread} size="sm" type="submit" variant="ghost">
              Tandai sudah dibaca
            </Button>
          </form>
        </div>

        {items.length > 0 ? (
          <div className="grid gap-4">
            {items.map((item) => <NotificationEntry item={item} key={item.id} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-primary-200 bg-white/70 px-5 py-10 text-center">
            <p className="text-sm font-semibold text-secondary-900">Belum ada notifikasi</p>
            <p className="mt-1 text-sm leading-6 text-secondary-600">Update dari kelas dan aktivitas belajar akan muncul di sini.</p>
          </div>
        )}
      </section>
    </StudentWorkspaceShell>
  );
}

export { NotificationsPageModule };

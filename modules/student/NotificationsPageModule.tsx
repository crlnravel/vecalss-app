import Link from "next/link";
import { Bell, ChevronRight } from "@/lib/icons";

import { Button } from "@/components/ui/button";
import { ReferenceEmptyState } from "@/components/dashboard";
import { REFERENCE_SURFACE_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { StudentBadge } from "@/components/ui/student-badge";
import { cn } from "@/lib/utils";
import type { StudentNotificationItem } from "@/lib/notifications/types";
import type { SessionContext } from "@/lib/auth/types";
import { markAllNotificationsReadAction } from "@/modules/student/actions";
import { StudentPageHero } from "@/modules/student/components/student-page-hero";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";

function NotificationEntry({ item }: { item: StudentNotificationItem }) {
  const content = (
    <>
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-2xl text-voyage-deep",
          item.unread
            ? "bg-student-status-attention-solid-bg text-student-status-attention-solid-fg"
            : "bg-voyage-sea-glass",
        )}
      >
        <Bell aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-secondary-900">
            {item.title}
          </p>
          {item.unread ? (
            <StudentBadge size="xs" tone="attention">
              Belum dibaca
            </StudentBadge>
          ) : null}
        </div>
        <p className="mt-1 text-sm leading-6 text-secondary-600">
          {item.detail}
        </p>
        <p className="mt-2 text-xs text-secondary-500">{item.time}</p>
      </div>

      <span className="mt-0.5 hidden size-9 shrink-0 place-items-center rounded-full bg-voyage-sea-glass text-voyage-deep transition-colors group-hover:bg-voyage-deep group-hover:text-white md:grid motion-reduce:transition-none">
        <ChevronRight aria-hidden="true" className="size-4" />
      </span>
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
      <section className="flex flex-col gap-8">
        <StudentPageHero
          actions={
            <form action={markAllNotificationsReadAction}>
              <Button
                className="border-white/20 bg-white text-voyage-deep hover:border-white hover:bg-voyage-sea-glass hover:text-voyage-deep disabled:bg-white/55 disabled:text-voyage-deep/65"
                disabled={!hasUnread}
                size="default"
                type="submit"
                variant="outline"
              >
                Tandai sudah dibaca
              </Button>
            </form>
          }
          description="Pantau pembaruan kelas, pengingat belajar, dan undangan Tryout dari satu tempat."
          icon={Bell}
          meta={
            <span className="inline-flex min-h-10 items-center rounded-full bg-student-status-attention-solid-bg px-4 text-sm font-bold tabular-nums text-student-status-attention-solid-fg">
              {hasUnread ? `${unreadCount} belum dibaca` : "Semua sudah dibaca"}
            </span>
          }
          title="Notifikasi"
        />

        {items.length > 0 ? (
          <section aria-labelledby="notification-list-title" className="grid gap-4">
            <div className="flex items-center gap-4 px-1">
              <h2 className="text-xl font-extrabold tracking-[-0.025em] text-voyage-ink" id="notification-list-title">
                Pembaruan terbaru
              </h2>
              <span aria-hidden="true" className="h-px flex-1 bg-learning-card-border" />
            </div>
            <div className="grid gap-4">
              {items.map((item) => <NotificationEntry item={item} key={item.id} />)}
            </div>
          </section>
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

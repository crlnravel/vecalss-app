import Link from "next/link";
import { Bell, ChevronRight } from "@/lib/icons";

import { Button } from "@/components/ui/button";
import { ReferenceEmptyState } from "@/components/dashboard";
import { REFERENCE_SURFACE_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { StudentBadge } from "@/components/ui/student-badge";
import { cn } from "@/lib/utils";
import type { StudentNotificationDetail } from "@/lib/notifications/service";
import type { StudentNotificationItem } from "@/lib/notifications/types";
import type { SessionContext } from "@/lib/auth/types";
import { markAllNotificationsReadAction } from "@/modules/student/actions";
import { NotificationDetailModal } from "@/modules/student/NotificationDetailModal";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";

function NotificationEntry({ item, page }: { item: StudentNotificationItem; page: number }) {
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
        REFERENCE_SURFACE_CLASS_NAMES.tactile,
        "group flex items-start gap-4 border-learning-card-border px-5 py-4 transition-[border-color,background-color] duration-200 hover:border-voyage-forest focus-visible:ring-3 focus-visible:ring-primary-300/35 motion-reduce:transition-none",
      )}
      href={{
        pathname: "/notifications",
        query: { notification: item.id, ...(page > 1 ? { page: String(page) } : {}) },
      }}
      prefetch={false}
    >
      {content}
    </Link>
  );
}

function NotificationsPageModule({
  items,
  notification,
  page,
  pageCount,
  session,
  unreadCount,
}: {
  items: StudentNotificationItem[];
  notification: StudentNotificationDetail | null;
  page: number;
  pageCount: number;
  session: SessionContext;
  unreadCount: number;
}) {
  const hasUnread = unreadCount > 0;
  const pageHref = (nextPage: number) => nextPage === 1 ? "/notifications" : `/notifications?page=${nextPage}`;

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
        <header className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-extrabold tracking-[-0.035em] text-voyage-ink">Notifikasi</h1>
          <form action={markAllNotificationsReadAction}>
            <Button disabled={!hasUnread} size="default" type="submit" variant="brand">
              Tandai sudah dibaca
            </Button>
          </form>
        </header>

        {items.length > 0 ? (
          <section aria-label="Daftar notifikasi" className="grid gap-4">
            <div className="grid gap-4">
              {items.map((item) => <NotificationEntry item={item} key={item.id} page={page} />)}
            </div>
            {pageCount > 1 ? (
              <Pagination aria-label="Halaman notifikasi" className="pt-2">
                <PaginationContent className="w-full justify-between sm:w-auto sm:justify-center">
                  <PaginationItem>
                    {page > 1 ? (
                      <PaginationPrevious
                        nativeButton={false}
                        render={<Link href={pageHref(page - 1)} />}
                      />
                    ) : (
                      <PaginationPrevious disabled />
                    )}
                  </PaginationItem>
                  <PaginationItem>
                    <span aria-current="page" className="px-3 text-sm font-semibold tabular-nums text-secondary-600">
                      Halaman {page} dari {pageCount}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    {page < pageCount ? (
                      <PaginationNext
                        nativeButton={false}
                        render={<Link href={pageHref(page + 1)} />}
                      />
                    ) : (
                      <PaginationNext disabled />
                    )}
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            ) : null}
          </section>
        ) : (
          <ReferenceEmptyState
            className={cn(REFERENCE_SURFACE_CLASS_NAMES.tactile, "border-learning-card-border overflow-hidden")}
            description="Update dari kelas dan aktivitas belajar akan muncul di sini."
            icon={Bell}
            title="Belum ada notifikasi"
          />
        )}
      </section>
      {notification ? (
        <NotificationDetailModal
          closeHref={pageHref(page)}
          key={notification.id}
          notification={notification}
        />
      ) : null}
    </StudentWorkspaceShell>
  );
}

export { NotificationsPageModule };

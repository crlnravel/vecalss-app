import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";

import { ArrowLeft, ArrowUpRight } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationDetail } from "@/lib/notifications/service";
import type { StudentNotificationItem } from "@/lib/notifications/types";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";

function safeMarkdownHref(value: string | undefined) {
  if (!value || /[\\\u0000-\u001f]/u.test(value)) {
    return null;
  }

  if (value.startsWith("/") && !value.startsWith("//")) {
    return { external: false, href: value };
  }

  try {
    const url = new URL(value);
    if (url.protocol === "https:") {
      return { external: true, href: url.toString() };
    }
  } catch {
    // Invalid Markdown links are rendered as non-interactive text.
  }

  return null;
}

function safeMarkdownUrl(value: string) {
  return safeMarkdownHref(value)?.href ?? "";
}

const markdownComponents: Components = {
  a: ({ children, href }) => {
    const safeLink = safeMarkdownHref(href);
    if (!safeLink) {
      return <span className="text-secondary-700">{children}</span>;
    }

    if (safeLink.external) {
      return (
        <a
          className="font-medium text-primary-800 underline decoration-primary-200 underline-offset-4 hover:text-primary-950"
          href={safeLink.href}
          rel="noreferrer"
          target="_blank"
        >
          {children}
        </a>
      );
    }

    return (
      <Link
        className="font-medium text-primary-800 underline decoration-primary-200 underline-offset-4 hover:text-primary-950"
        href={safeLink.href}
      >
        {children}
      </Link>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="my-5 border-l-4 border-primary-200 pl-5 text-secondary-600 italic">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded-md bg-primary-50 px-1.5 py-0.5 font-mono text-[0.9em] text-primary-900">
      {children}
    </code>
  ),
  h1: ({ children }) => (
    <h1 className="mt-8 text-2xl font-semibold tracking-[-0.03em] text-secondary-950 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-7 text-xl font-semibold tracking-[-0.025em] text-secondary-950">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 text-lg font-semibold text-secondary-900">
      {children}
    </h3>
  ),
  hr: () => <hr className="my-7 border-primary-100" />,
  li: ({ children }) => <li className="pl-1 leading-7 text-secondary-700">{children}</li>,
  ol: ({ children }) => <ol className="my-4 list-decimal space-y-2 pl-6">{children}</ol>,
  p: ({ children }) => <p className="my-4 leading-7 text-secondary-700">{children}</p>,
  pre: ({ children }) => (
    <pre className="my-5 overflow-x-auto rounded-2xl bg-secondary-950 p-4 text-sm leading-6 text-white">
      {children}
    </pre>
  ),
  strong: ({ children }) => <strong className="font-semibold text-secondary-900">{children}</strong>,
  ul: ({ children }) => <ul className="my-4 list-disc space-y-2 pl-6">{children}</ul>,
};

function NotificationDetailPageModule({
  notification,
  notificationItems,
  notificationUnreadCount,
  session,
}: {
  notification: StudentNotificationDetail;
  notificationItems: StudentNotificationItem[];
  notificationUnreadCount: number;
  session: SessionContext;
}) {
  const isTryoutWaitingRoomLink = /^\/tryout\/[^/]+\/waiting$/u.test(notification.href);

  return (
    <StudentWorkspaceShell
      activeLabel="Notifikasi"
      breadcrumbLabel={notification.title}
      notificationItems={notificationItems}
      notificationUnreadCount={notificationUnreadCount}
      searchPlaceholder="Cari notifikasi atau update belajar..."
      session={session}
    >
      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary-800 transition-colors hover:text-primary-950"
            href="/notifications"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Kembali ke notifikasi
          </Link>
        </div>

        <article className="rounded-3xl border border-primary-100 bg-white px-5 py-7 shadow-[0_24px_55px_-42px_rgba(1,76,56,0.5)] sm:px-8 sm:py-9">
          <header>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-secondary-950 sm:text-4xl">
              {notification.title}
            </h1>
            <p className="mt-3 text-sm text-secondary-500">{notification.time}</p>
          </header>

          <div className="mt-7 max-w-3xl text-base">
            <ReactMarkdown
              components={markdownComponents}
              skipHtml
              urlTransform={safeMarkdownUrl}
            >
              {notification.body}
            </ReactMarkdown>
          </div>

          {notification.external ? (
            <Button
              className="mt-8"
              nativeButton={false}
              render={<a aria-label="Buka tautan Zoom" href={notification.href} rel="noreferrer" target="_blank" />}
              variant="brand"
            >
              Buka tautan Zoom
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Button>
          ) : isTryoutWaitingRoomLink ? (
            <Button
              className="mt-8"
              nativeButton={false}
              render={<Link href={notification.href} />}
              variant="brand"
            >
              Buka ruang tunggu
            </Button>
          ) : null}
        </article>
      </section>
    </StudentWorkspaceShell>
  );
}

export { NotificationDetailPageModule };

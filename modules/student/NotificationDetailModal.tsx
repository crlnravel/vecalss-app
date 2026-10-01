"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown, { type Components } from "react-markdown";

import { ArrowUpRight } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { StudentNotificationDetail } from "@/lib/notifications/service";

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
    <blockquote className="my-5 rounded-2xl border border-primary-100 bg-primary-50/70 px-5 py-4 text-secondary-700">
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

function NotificationDetailModal({
  closeHref,
  notification,
}: {
  closeHref: string;
  notification: StudentNotificationDetail;
}) {
  const router = useRouter();
  const isTryoutWaitingRoomLink = /^\/tryout\/[^/]+\/waiting$/u.test(notification.href);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) router.replace(closeHref);
      }}
    >
      <DialogContent
        className="flex flex-col gap-0 bg-white px-6 py-8 sm:min-h-[min(60svh,34rem)] sm:max-w-4xl sm:px-10 sm:py-10"
        overlayClassName="bg-secondary-900/45 supports-backdrop-filter:backdrop-blur-md"
      >
        <DialogHeader className="border-b border-primary-100 pb-6 pr-12">
          <DialogTitle className="font-display text-3xl leading-tight font-extrabold tracking-[-0.04em] text-voyage-ink text-balance md:text-4xl">
            {notification.title}
          </DialogTitle>
          <p className="mt-2 text-sm text-secondary-600">{notification.time}</p>
        </DialogHeader>

        <div className="max-w-[65ch] flex-1 pt-2 text-base">
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
            className="mt-8 self-start"
            nativeButton={false}
            render={<a aria-label="Buka tautan Zoom" href={notification.href} rel="noreferrer" target="_blank" />}
            variant="default"
          >
            Buka tautan Zoom
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Button>
        ) : isTryoutWaitingRoomLink ? (
          <Button
            className="mt-8 self-start"
            nativeButton={false}
            render={<Link href={notification.href} />}
            variant="default"
          >
            Buka ruang tunggu
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export { NotificationDetailModal };

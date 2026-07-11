"use client";

import Link from "next/link";
import { Bell, BookOpenText, Search } from "lucide-react";
import type { ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { MentorSidebar, getInitials } from "@/modules/mentor/components/mentor-sidebar";
import {
  kaptenNotificationItems,
  type KaptenNotificationItem,
} from "@/modules/mentor/mock-data";

function KaptenNotificationPopover({
  items = [],
}: {
  items?: KaptenNotificationItem[];
}) {
  const unreadCount = items.filter((item) => item.unread).length;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label="Notifikasi workspace"
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
          <PopoverTitle>Notifikasi CMS</PopoverTitle>
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
      </PopoverContent>
    </Popover>
  );
}

function KaptenAccountMenu({ session }: { session: SessionContext }) {
  const initials = getInitials(session.user.fullName);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Buka menu Kapten"
            className="rounded-full p-1"
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <Avatar className="size-9 border border-primary-100">
          <AvatarFallback className="bg-primary-700 text-xs font-semibold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <span className="block text-sm font-semibold text-secondary-900">
            {session.user.fullName}
          </span>
          <span className="block truncate text-xs">{session.user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/mentor/dashboard" />}>
            Dashboard
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/mentor/materi" />}>
            Materi
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/mentor/quiz" />}>
            Quiz
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/mentor/settings" />}>
            Pengaturan
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MentorWorkspaceShell({
  activeLabel,
  breadcrumbLabel,
  children,
  mainClassName,
  notificationItems = kaptenNotificationItems,
  searchPlaceholder = "Cari konten, quiz, tryout, atau asset...",
  session,
}: {
  activeLabel: string;
  breadcrumbLabel: string;
  children: ReactNode;
  mainClassName?: string;
  notificationItems?: KaptenNotificationItem[];
  searchPlaceholder?: string;
  session: SessionContext;
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full bg-[#f7faf8] text-secondary-900">
        <MentorSidebar
          activeLabel={activeLabel}
          footerLabel="Kapten CMS"
          fullName={session.user.fullName}
        />

        <SidebarInset className="bg-transparent">
          <header className="sticky top-0 z-20 border-b border-primary-100/80 bg-[#f7faf8]/90 backdrop-blur-xl">
            <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="shrink-0" />

              <div className="hidden min-w-0 flex-1 md:block">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink
                        href="/mentor/dashboard"
                        className="text-secondary-500"
                      >
                        Vecalss CMS
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>

              <div className="relative ml-auto hidden w-full max-w-sm md:block">
                <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-secondary-400" />
                <Input
                  aria-label={searchPlaceholder}
                  className="h-10 rounded-full border-primary-100 bg-white pl-10 shadow-sm"
                  placeholder={searchPlaceholder}
                />
              </div>

              <Button
                render={<Link href="/mentor/materi/create" />}
                size="sm"
                variant="brand"
              >
                <BookOpenText />
                Buat Konten
              </Button>
              <KaptenNotificationPopover items={notificationItems} />
              <KaptenAccountMenu session={session} />
            </div>
          </header>

          <ScrollArea className="h-[calc(100svh-4rem)]">
            <main
              className={cn(
                "mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10",
                mainClassName,
              )}
            >
              {children}
            </main>
          </ScrollArea>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export { MentorWorkspaceShell };

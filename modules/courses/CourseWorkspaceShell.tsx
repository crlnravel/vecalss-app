"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  Bell,
  BookOpen,
  Bot,
  Gauge,
  Home,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Search,
  Settings,
  Target,
  UserRound,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/modules/auth/actions";
import { BrandMark } from "@/modules/home/components/home-primitives";

type NavigationItem = {
  badge?: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
};

const navigationItems: NavigationItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/courses", icon: BookOpen, label: "Course Catalogue" },
  { href: "#quiz", icon: ListChecks, label: "Quiz" },
  { href: "#tryout", icon: Gauge, label: "Tryout" },
  { href: "#progress", icon: Target, label: "Progress" },
  { href: "#vera-ai", icon: Bot, label: "Vera AI" },
  { href: "#notifications", icon: Bell, label: "Notifications", badge: "2" },
  { href: "#settings", icon: Settings, label: "Profile / Settings" },
];

function getInitials(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function CourseWorkspaceShell({
  activeLabel,
  breadcrumbLabel,
  children,
  searchPlaceholder = "Cari course, video, atau topik...",
  session,
}: {
  activeLabel: string;
  breadcrumbLabel: string;
  children: React.ReactNode;
  searchPlaceholder?: string;
  session: SessionContext;
}) {
  const initials = getInitials(session.user.fullName);

  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full bg-[#f7faf8] text-secondary-900">
        <Sidebar
          collapsible="icon"
          className="border-primary-100 bg-white/95 backdrop-blur"
        >
          <SidebarHeader className="gap-4 p-4">
            <Link
              href="/"
              className="flex origin-center scale-100 items-center justify-center rounded-2xl px-1 py-1 transition-transform duration-300 ease-out group-data-[collapsible=icon]:scale-50"
            >
              <BrandMark />
            </Link>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Belajar</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigationItems.map((item) => (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton
                        isActive={item.label === activeLabel}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.badge ? (
                        <SidebarMenuBadge className="bg-accent-300 text-secondary-900">
                          {item.badge}
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-2">
            <div className="w-full overflow-hidden rounded-3xl border border-primary-100 bg-white p-3 shadow-sm transition-all duration-300 ease-out group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:shadow-none">
              <div className="flex items-center gap-3 transition-[gap] duration-300 ease-out group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
                <Avatar className="size-10 origin-center border border-primary-100 shadow-sm transition-transform duration-300 ease-out group-data-[collapsible=icon]:scale-[0.8]">
                  <AvatarFallback className="bg-primary-700 text-sm font-semibold text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <p className="truncate text-sm font-semibold text-secondary-900">
                    {session.user.fullName}
                  </p>
                  <p className="truncate text-xs text-secondary-500">
                    Student workspace
                  </p>
                </div>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="bg-transparent">
          <header className="sticky top-0 z-20 border-b border-primary-100/80 bg-[#f7faf8]/90 backdrop-blur-xl">
            <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="shrink-0" />

              <div className="hidden min-w-0 flex-1 md:block">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href="/" className="text-secondary-500">
                        Vecalss
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

              <Button aria-label="Notifications" size="icon-sm" variant="ghost">
                <Bell />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label="Open user menu"
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
                    <span className="block truncate text-xs">
                      {session.user.email}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem>
                      <UserRound />
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Settings />
                      Preferences
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Home />
                      Student home
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <form action={logoutAction}>
                    <input name="audience" type="hidden" value="student" />
                    <DropdownMenuItem
                      render={<button className="w-full" type="submit" />}
                    >
                      <LogOut />
                      Log out
                    </DropdownMenuItem>
                  </form>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <ScrollArea className="h-[calc(100svh-4rem)]">
            <main
              className={cn(
                "mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10",
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

export { CourseWorkspaceShell };

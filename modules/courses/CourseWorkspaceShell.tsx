"use client";

import {
  Bell,
  Home,
  LogOut,
  Search,
  Settings,
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
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/modules/auth/actions";
import {
  getInitials,
  StudentSidebar,
} from "@/modules/student/components/student-sidebar";

function CourseWorkspaceShell({
  activeLabel,
  breadcrumbLabel,
  children,
  searchPlaceholder = "Cari materi, video, atau topik...",
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
        <StudentSidebar
          activeLabel={activeLabel}
          footerLabel="Student workspace"
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

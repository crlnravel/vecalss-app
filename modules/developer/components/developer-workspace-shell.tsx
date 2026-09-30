"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ClipboardList, LoaderCircle, LogOut } from "@/lib/icons";
import { logoutAction } from "@/modules/auth/actions";
import { BrandLockup, BrandMark } from "@/modules/home/components/home-primitives";
import { getInitials } from "@/modules/student/components/student-sidebar-utils";

function DeveloperNavigation({ isDetailPage }: { isDetailPage: boolean }) {
  const { isMobile, setOpenMobile, state } = useSidebar();
  const isCollapsed = !isMobile && state === "collapsed";
  const toggleLabel = isMobile ? "Tutup navigasi" : isCollapsed ? "Buka navigasi" : "Ciutkan navigasi";

  return (
    <Sidebar
      collapsible="icon"
      variant="floating"
      className="border-0 bg-transparent lg:bottom-4 lg:h-auto lg:left-4! lg:top-4 [&>div]:rounded-4xl [&>div]:border [&>div]:border-primary-100 [&>div]:bg-white [&>div]:shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)] [&>div]:ring-0"
    >
      <SidebarHeader className="mb-2 gap-5 p-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
        <Link
          aria-label="Vecalss — ruang kerja Developer"
          className="flex min-h-11 w-full items-center justify-center rounded-2xl px-1 py-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35 group-data-[collapsible=icon]:p-0"
          href="/developer/reports"
          onClick={() => setOpenMobile(false)}
        >
          {isCollapsed ? <BrandMark compact /> : <BrandLockup />}
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="mb-2 group-data-[collapsible=icon]:mb-0.5! group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-0">
          <SidebarGroupLabel className="h-auto min-h-8 px-3 py-2 text-ui-xs font-semibold tracking-[0.14em] text-secondary-500 uppercase group-data-[collapsible=icon]:hidden">
            Developer
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="h-11 min-h-11 rounded-2xl px-3 text-sm font-medium text-secondary-500 transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none hover:bg-primary-50/70 hover:text-secondary-900 focus-visible:ring-3 focus-visible:ring-primary-300/35 data-active:bg-primary-50 data-active:text-primary-800 data-active:shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)] group-data-[collapsible=icon]:bg-transparent! group-data-[collapsible=icon]:shadow-none! group-data-[collapsible=icon]:mx-auto! group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:p-0!"
                  isActive
                  render={<Link aria-current={isDetailPage ? undefined : "page"} aria-label="Laporan" href="/developer/reports" />}
                  onClick={() => setOpenMobile(false)}
                  tooltip="Laporan"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:bg-primary-50 group-data-[collapsible=icon]:text-primary-800 group-data-[collapsible=icon]:shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)]">
                    <ClipboardList aria-hidden="true" className="size-5" />
                  </span>
                  <span className="group-data-[collapsible=icon]:hidden">Laporan</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0!">
        <SidebarTrigger
          aria-label={toggleLabel}
          className="min-h-11 w-full justify-end rounded-2xl border border-primary-100 bg-primary-50/60 px-4 text-secondary-500 hover:bg-primary-50 hover:text-secondary-900 focus-visible:ring-3 focus-visible:ring-primary-300/35 group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
        />
      </SidebarFooter>
    </Sidebar>
  );
}

function DeveloperLogoutDialogFooter() {
  const { pending } = useFormStatus();

  return (
    <AlertDialogFooter>
      <AlertDialogCancel disabled={pending} type="button">Batal</AlertDialogCancel>
      <AlertDialogAction disabled={pending} type="submit" variant="destructive">
        {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
        {pending ? "Keluar dari akun…" : "Keluar dari akun"}
      </AlertDialogAction>
    </AlertDialogFooter>
  );
}

function DeveloperAccountMenu({ userName }: { userName: string }) {
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Menu akun"
          render={<Button className="size-11 rounded-full bg-primary-100 p-0 text-xs font-semibold text-primary-900 hover:bg-primary-200" variant="ghost" />}
        >
          {getInitials(userName)}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" sideOffset={8}>
          <div className="flex flex-col gap-1 px-2 py-1.5">
            <span className="truncate text-sm font-semibold text-secondary-900">{userName}</span>
            <span className="text-xs text-secondary-500">Developer</span>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="hover:bg-primary-50 focus:bg-primary-50 data-highlighted:bg-primary-50"
            onClick={() => setIsLogoutDialogOpen(true)}
          >
            <LogOut aria-hidden="true" />
            Keluar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog onOpenChange={setIsLogoutDialogOpen} open={isLogoutDialogOpen}>
        <AlertDialogContent variant="warning">
          <AlertDialogHeader>
            <AlertDialogTitle>Keluar dari akun?</AlertDialogTitle>
            <AlertDialogDescription>Kamu perlu masuk kembali untuk melanjutkan.</AlertDialogDescription>
          </AlertDialogHeader>
          <form action={logoutAction}>
            <input name="audience" type="hidden" value="developer" />
            <DeveloperLogoutDialogFooter />
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DeveloperWorkspaceShell({
  children,
  isDetailPage = false,
  userName,
}: {
  children: ReactNode;
  isDetailPage?: boolean;
  userName: string;
}) {
  return (
    <SidebarProvider className="!bg-voyage-canvas lg:gap-2 lg:p-6">
      <div className="flex min-h-svh w-full bg-voyage-canvas text-secondary-900 lg:gap-2">
        <DeveloperNavigation isDetailPage={isDetailPage} />

        <SidebarInset className="min-h-svh min-w-0 bg-voyage-canvas lg:rounded-3xl">
          <header aria-label="Header workspace Developer" className="sticky top-0 z-20 mx-auto w-[calc(100%-2rem)] max-w-[calc(1420px-2rem)] bg-voyage-canvas/90 backdrop-blur-xl md:w-[calc(100%-4rem)] md:max-w-[calc(1420px-4rem)] lg:top-6 lg:w-[calc(100%-5rem)] lg:max-w-[calc(1420px-5rem)] lg:rounded-3xl lg:border">
            <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger aria-label="Buka atau tutup navigasi" className="size-[44px] min-h-[44px] min-w-[44px] shrink-0 motion-reduce:transition-none lg:hidden" />

              <Breadcrumb className="hidden min-w-0 flex-1 md:block">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    {isDetailPage ? <BreadcrumbLink href="/developer/reports">Laporan</BreadcrumbLink> : <BreadcrumbPage>Laporan</BreadcrumbPage>}
                  </BreadcrumbItem>
                  {isDetailPage ? (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem><BreadcrumbPage>Detail laporan</BreadcrumbPage></BreadcrumbItem>
                    </>
                  ) : null}
                </BreadcrumbList>
              </Breadcrumb>

              <div className="ml-auto" />
              <DeveloperAccountMenu userName={userName} />
            </div>
          </header>

          <div className="mx-auto flex min-w-0 w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10">
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export { DeveloperWorkspaceShell };

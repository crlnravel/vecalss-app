"use client";

import Link from "next/link";
import { type ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import { ClipboardList, LayoutGrid } from "@/lib/icons";
import { BrandLockup, BrandMark } from "@/modules/home/components/home-primitives";
import { StudentAccountMenu, type AccountMenuUser } from "@/modules/student/components/student-account-menu";

type DeveloperWorkspacePage = "reports" | "components";

const developerNavigationItems = [
  { page: "reports", label: "Laporan", href: "/developer/reports", icon: ClipboardList },
  { page: "components", label: "Komponen", href: "/developer/components", icon: LayoutGrid },
] as const;

function DeveloperNavigation({ activePage, isDetailPage }: { activePage: DeveloperWorkspacePage; isDetailPage: boolean }) {
  const { isMobile, setOpenMobile, state } = useSidebar();
  const isCollapsed = !isMobile && state === "collapsed";
  const toggleLabel = isMobile ? "Tutup navigasi" : isCollapsed ? "Buka navigasi" : "Ciutkan navigasi";

  return (
    <Sidebar
      collapsible="icon"
      variant="floating"
      className="border-0 bg-transparent lg:bottom-4 lg:h-auto lg:left-4! lg:top-4 [&>div]:rounded-control [&>div]:border [&>div]:border-primary-100 [&>div]:bg-white [&>div]:shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)] [&>div]:ring-0"
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
              {developerNavigationItems.map((item) => (
              <SidebarMenuItem key={item.page}>
                <SidebarMenuButton
                  className="h-11 min-h-11 rounded-2xl px-3 text-sm font-medium text-secondary-500 transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none hover:bg-primary-50/70 hover:text-secondary-900 focus-visible:ring-3 focus-visible:ring-primary-300/35 data-active:bg-primary-50 data-active:text-primary-800 data-active:shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)] group-data-[collapsible=icon]:bg-transparent! group-data-[collapsible=icon]:shadow-none! group-data-[collapsible=icon]:mx-auto! group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:p-0!"
                  isActive={activePage === item.page}
                  render={<Link aria-current={activePage === item.page && !isDetailPage ? "page" : undefined} aria-label={item.label} href={item.href} />}
                  onClick={() => setOpenMobile(false)}
                  tooltip={item.label}
                >
                  <span className={`flex size-4 shrink-0 items-center justify-center group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:rounded-full ${activePage === item.page ? "group-data-[collapsible=icon]:bg-primary-50 group-data-[collapsible=icon]:text-primary-800 group-data-[collapsible=icon]:shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)]" : "group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:text-secondary-500"}`}>
                    <item.icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              ))}
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

function DeveloperWorkspaceShell({
  activePage = "reports",
  children,
  isDetailPage = false,
  accountUser,
}: {
  activePage?: DeveloperWorkspacePage;
  children: ReactNode;
  isDetailPage?: boolean;
  accountUser: AccountMenuUser;
}) {
  return (
    <SidebarProvider className="!bg-voyage-canvas lg:gap-2 lg:p-6">
      <div className="flex min-h-svh w-full bg-voyage-canvas text-secondary-900 lg:gap-2">
        <DeveloperNavigation activePage={activePage} isDetailPage={isDetailPage} />

        <SidebarInset className="min-h-svh min-w-0 bg-voyage-canvas lg:rounded-3xl">
          <header aria-label="Header workspace Developer" className="sticky top-0 z-20 mx-auto w-[calc(100%-2rem)] max-w-[calc(1420px-2rem)] bg-voyage-canvas/90 backdrop-blur-xl md:w-[calc(100%-4rem)] md:max-w-[calc(1420px-4rem)] lg:top-6 lg:w-[calc(100%-5rem)] lg:max-w-[calc(1420px-5rem)] lg:rounded-control lg:border">
            <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger aria-label="Buka atau tutup navigasi" className="size-[44px] min-h-[44px] min-w-[44px] shrink-0 motion-reduce:transition-none lg:hidden" />

              <Breadcrumb className="hidden min-w-0 flex-1 md:block">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    {activePage === "components" ? <BreadcrumbPage>Komponen</BreadcrumbPage> : isDetailPage ? <BreadcrumbLink href="/developer/reports">Laporan</BreadcrumbLink> : <BreadcrumbPage>Laporan</BreadcrumbPage>}
                  </BreadcrumbItem>
                  {isDetailPage && activePage === "reports" ? (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem><BreadcrumbPage>Detail laporan</BreadcrumbPage></BreadcrumbItem>
                    </>
                  ) : null}
                </BreadcrumbList>
              </Breadcrumb>

              <div className="ml-auto" />
              <StudentAccountMenu audience="developer" session={{ user: accountUser }} />
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

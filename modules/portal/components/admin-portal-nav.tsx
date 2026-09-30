"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  BookOpenCheck,
  Bell,
  ChevronLeft,
  ChevronRight,
  History,
  LayoutDashboard,
  SlidersHorizontal,
  Share2,
  Sparkles,
  TableIcon,
  Users,
} from "@/lib/icons";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { BrandLockup, BrandMark } from "@/modules/home/components/home-primitives";

type AdminSection = "overview" | "ai" | "students" | "kapten" | "affiliators" | "notifications" | "audit-logs" | "ai-usage" | "ai-policy" | "student-banners" | "docs" | "table-demo";

type AdminNavigationItem = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  id: Exclude<AdminSection, "overview"> | "overview";
  label: string;
};

const adminOperationNavigation: AdminNavigationItem[] = [
  { href: "/admin", icon: LayoutDashboard, id: "overview", label: "Dashboard" },
  { href: "/admin/ai", icon: Sparkles, id: "ai", label: "Vera AI" },
  { href: "/admin/notifications", icon: Bell, id: "notifications", label: "Kirim notifikasi" },
  { href: "/admin/audit-logs", icon: History, id: "audit-logs", label: "Riwayat audit" },
  { href: "/admin/table-demo", icon: TableIcon, id: "table-demo", label: "Demo tabel" },
];

const adminDirectoryNavigation: AdminNavigationItem[] = [
  { href: "/admin/enrollment", icon: Users, id: "students", label: "Siswa" },
  { href: "/admin/kapten", icon: BookOpenCheck, id: "kapten", label: "Kapten" },
  { href: "/admin/affiliators", icon: Share2, id: "affiliators", label: "Affiliator" },
];

const adminContentNavigation: AdminNavigationItem[] = [
  { href: "/admin/student-banners", icon: SlidersHorizontal, id: "student-banners", label: "Editor banner" },
];

function AdminNavigationGroup({
  activeSection,
  items,
  label,
}: {
  activeSection: AdminSection;
  items: AdminNavigationItem[];
  label: string;
}) {
  return (
    <SidebarGroup className="mb-2 group-data-[collapsible=icon]:mb-0.5! group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-0">
      <SidebarGroupLabel className="h-auto min-h-8 px-3 py-2 text-ui-xs font-semibold tracking-[0.14em] text-secondary-500 uppercase group-data-[collapsible=icon]:hidden">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                className={cn(
                  "h-11 min-h-11 rounded-2xl px-3 text-sm font-medium text-secondary-500 transition-[background-color,color,box-shadow] hover:bg-primary-50/70 hover:text-secondary-900 focus-visible:ring-3 focus-visible:ring-primary-300/35",
                  "data-active:bg-primary-50 data-active:text-primary-800 data-active:shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)]",
                  "group-data-[collapsible=icon]:mx-auto! group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:p-0!",
                  item.id === activeSection &&
                    "group-data-[collapsible=icon]:bg-transparent! group-data-[collapsible=icon]:shadow-none!",
                )}
                isActive={item.id === activeSection || (item.id === "overview" && activeSection === "overview")}
                render={<Link href={item.href} />}
                tooltip={item.label}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center [&>svg]:size-4",
                    item.id === activeSection &&
                      "group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:bg-primary-50 group-data-[collapsible=icon]:text-primary-800 group-data-[collapsible=icon]:shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)] [&>svg]:size-5",
                  )}
                >
                  <item.icon />
                </span>
                <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function AdminPortalNav({ activeSection }: {
  activeSection: AdminSection;
}) {
  const { isMobile, state } = useSidebar();
  const isCompactReferenceMark = !isMobile && state === "collapsed";

  return (
    <Sidebar
      className="border-0 bg-transparent lg:bottom-4 lg:h-auto lg:left-4! lg:top-4 [&>div]:rounded-4xl [&>div]:border [&>div]:border-primary-100 [&>div]:bg-white [&>div]:shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)] [&>div]:ring-0"
      collapsible="icon"
      variant="floating"
    >
      <SidebarHeader className="mb-2 gap-5 p-3 group-data-[collapsible=icon]:px-0">
        <Link
          className={cn(
            "flex w-full origin-center scale-100 items-center justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35",
            isCompactReferenceMark ? "px-0 py-0" : "px-1 py-1",
          )}
          href="/admin"
        >
          {isCompactReferenceMark ? <BrandMark compact /> : <BrandLockup />}
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <AdminNavigationGroup
          activeSection={activeSection}
          items={adminOperationNavigation}
          label="Operasional"
        />
        <AdminNavigationGroup
          activeSection={activeSection}
          items={adminContentNavigation}
          label="Konten"
        />
        <AdminNavigationGroup
          activeSection={activeSection}
          items={adminDirectoryNavigation}
          label="Direktori"
        />
      </SidebarContent>

      <SidebarFooter className="hidden p-3 md:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0!">
        <SidebarTrigger
          aria-label={state === "collapsed" ? "Buka navigasi" : "Ciutkan navigasi"}
          className={cn(
            "min-h-11 w-full rounded-2xl border border-primary-100 bg-primary-50/60 text-secondary-500 transition-[background-color,color,box-shadow] hover:bg-primary-50 hover:text-secondary-900 focus-visible:ring-3 focus-visible:ring-primary-300/35",
            state === "collapsed" ? "justify-center" : "justify-end px-4",
            "group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:p-0!",
          )}
        >
          {state === "collapsed" ? (
            <ChevronRight aria-hidden="true" className="size-4" />
          ) : (
            <ChevronLeft aria-hidden="true" className="size-4" />
          )}
        </SidebarTrigger>
      </SidebarFooter>
    </Sidebar>
  );
}

export { AdminPortalNav };
export type { AdminSection };

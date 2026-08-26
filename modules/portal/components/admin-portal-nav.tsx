"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  BookOpenCheck,
  Bell,
  Eye,
  History,
  LayoutDashboard,
  BarChart3,
  Users,
} from "@/lib/icons";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BrandLockup } from "@/modules/home/components/home-primitives";

type AdminSection = "overview" | "students" | "kapten" | "notifications" | "audit-logs" | "ai-usage" | "student-banners" | "student-preview" | "docs";

type AdminNavigationItem = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  id: Exclude<AdminSection, "overview"> | "overview";
  label: string;
};

const adminOperationNavigation: AdminNavigationItem[] = [
  { href: "/admin", icon: LayoutDashboard, id: "overview", label: "Dashboard" },
  { href: "/admin/ai-usage", icon: BarChart3, id: "ai-usage", label: "AI usage" },
  { href: "/admin/notifications", icon: Bell, id: "notifications", label: "Notifications" },
  { href: "/admin/audit-logs", icon: History, id: "audit-logs", label: "Audit logs" },
];

const adminDirectoryNavigation: AdminNavigationItem[] = [
  { href: "/admin/enrollment", icon: Users, id: "students", label: "Students" },
  { href: "/admin/kapten", icon: BookOpenCheck, id: "kapten", label: "Kapten" },
];

const adminPreviewNavigation: AdminNavigationItem[] = [
  { href: "/admin/student-preview", icon: Eye, id: "student-preview", label: "Student preview" },
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
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                isActive={item.id === activeSection || (item.id === "overview" && activeSection === "overview")}
                render={<Link href={item.href} />}
                tooltip={item.label}
              >
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function AdminPortalNav({
  activeSection,
  studentPreviewEnabled = false,
}: {
  activeSection: AdminSection;
  studentPreviewEnabled?: boolean;
}) {
  return (
    <Sidebar
      className="border-primary-100 bg-white/95 backdrop-blur"
      collapsible="icon"
    >
      <SidebarHeader className="gap-4 p-4 group-data-[collapsible=icon]:px-2">
        <Link
          className="flex w-full origin-center scale-100 items-center justify-center rounded-2xl px-1 py-1 transition-transform duration-300 ease-out group-data-[collapsible=icon]:-translate-x-1 group-data-[collapsible=icon]:scale-50"
          href="/admin"
        >
          <BrandLockup />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <AdminNavigationGroup
          activeSection={activeSection}
          items={adminOperationNavigation}
          label="Operations"
        />
        <AdminNavigationGroup
          activeSection={activeSection}
          items={adminDirectoryNavigation}
          label="Directories"
        />
        {studentPreviewEnabled ? (
          <AdminNavigationGroup
            activeSection={activeSection}
            items={adminPreviewNavigation}
            label="Preview"
          />
        ) : null}
      </SidebarContent>
    </Sidebar>
  );
}

export { AdminPortalNav };
export type { AdminSection };

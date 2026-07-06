"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  Bell,
  AlertTriangle,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BrandMark } from "@/modules/home/components/home-primitives";

type MentorNavigationItem = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
};

const mentorNavigationItems: MentorNavigationItem[] = [
  { href: "/mentor/dashboard#overview", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/mentor/dashboard#students", icon: Users, label: "Siswa" },
  { href: "/mentor/dashboard#signals", icon: AlertTriangle, label: "Sinyal" },
  { href: "/mentor/dashboard#signals", icon: Bell, label: "Notifikasi" },
  { href: "/mentor/dashboard#settings", icon: Settings, label: "Pengaturan" },
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

function MentorSidebar({
  activeLabel,
  cohortLabel,
  footerLabel,
  fullName,
  notificationBadge,
}: {
  activeLabel: string;
  cohortLabel: string;
  footerLabel: string;
  fullName: string;
  notificationBadge?: string;
}) {
  const initials = getInitials(fullName);

  return (
    <Sidebar
      collapsible="icon"
      className="border-primary-100 bg-white/95 backdrop-blur"
    >
      <SidebarHeader className="gap-4 p-4">
        <Link
          href="/mentor/dashboard"
          className="flex origin-center scale-100 items-center justify-center rounded-2xl px-1 py-1 transition-transform duration-300 ease-out group-data-[collapsible=icon]:scale-50"
        >
          <BrandMark />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Kapten</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mentorNavigationItems.map((item) => {
                const badge =
                  item.label === "Notifikasi" ? notificationBadge : undefined;

                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      isActive={item.label === activeLabel}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {badge ? (
                      <SidebarMenuBadge className="bg-accent-300 text-secondary-900">
                        {badge}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-2">
        <div className="w-full overflow-hidden rounded-3xl border border-primary-100 bg-white p-3 shadow-sm transition-all duration-300 ease-out group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:shadow-none">
          <div className="flex items-center gap-3 transition-[gap] duration-300 ease-out group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
            <div className="flex size-10 origin-center items-center justify-center rounded-full border border-primary-100 bg-primary-700 text-sm font-semibold text-white shadow-sm transition-transform duration-300 ease-out group-data-[collapsible=icon]:scale-[0.8]">
              {initials}
            </div>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold text-secondary-900">
                {fullName}
              </p>
              <p className="truncate text-xs text-secondary-500">
                {footerLabel}
              </p>
              <p className="truncate text-xs text-secondary-400">
                {cohortLabel}
              </p>
            </div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export { MentorSidebar, getInitials };

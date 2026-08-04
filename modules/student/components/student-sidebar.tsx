"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  Bell,
  BookOpen,
  Bot,
  Gauge,
  LayoutDashboard,
  ListChecks,
  UserRound,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BrandLockup } from "@/modules/home/components/home-primitives";

type StudentNavigationItem = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
};

const studentNavigationItems: StudentNavigationItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Beranda" },
  { href: "/courses", icon: BookOpen, label: "Materi" },
  { href: "/quiz", icon: ListChecks, label: "Kuis" },
  { href: "/tryout", icon: Gauge, label: "Tryout" },
  { href: "/vera-ai", icon: Bot, label: "Vera AI" },
  { href: "/notifications", icon: Bell, label: "Notifikasi" },
  { href: "/settings", icon: UserRound, label: "Profil" },
];

function StudentSidebar({
  activeLabel,
  notificationBadge,
}: {
  activeLabel: string;
  notificationBadge?: string;
}) {
  return (
    <Sidebar
      collapsible="icon"
      className="border-primary-100 bg-white/95 backdrop-blur"
    >
      <SidebarHeader className="gap-4 p-4 group-data-[collapsible=icon]:px-2">
        <Link
          href="/dashboard"
          className="flex w-full origin-center scale-100 items-center justify-center rounded-2xl px-1 py-1 transition-transform duration-300 ease-out group-data-[collapsible=icon]:-translate-x-1 group-data-[collapsible=icon]:scale-50"
        >
          <BrandLockup />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Belajar</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {studentNavigationItems.map((item) => {
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

    </Sidebar>
  );
}

export { StudentSidebar };

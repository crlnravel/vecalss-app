"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  BookOpenText,
  Gauge,
  Image as ImageIcon,
  LayoutDashboard,
  LibraryBig,
  ListChecks,
  Settings,
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

type KaptenNavigationItem = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
};

const kaptenMainNavigation: KaptenNavigationItem[] = [
  { href: "/mentor/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/mentor/materi", icon: BookOpenText, label: "Materi" },
  { href: "/mentor/quiz", icon: ListChecks, label: "Kuis" },
  {
    href: "/mentor/quiz/question-bank",
    icon: LibraryBig,
    label: "Bank Soal",
  },
];

const kaptenTryoutNavigation: KaptenNavigationItem[] = [
  { href: "/mentor/tryout", icon: Gauge, label: "Tryout" },
];

const kaptenUtilityNavigation: KaptenNavigationItem[] = [
  { href: "/mentor/media", icon: ImageIcon, label: "Media" },
  { href: "/mentor/settings", icon: Settings, label: "Pengaturan" },
];

function NavigationGroup({
  activeLabel,
  items,
  label,
}: {
  activeLabel: string;
  items: KaptenNavigationItem[];
  label: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.label}>
              <SidebarMenuButton
                isActive={item.label === activeLabel}
                tooltip={item.label}
                render={<Link href={item.href} />}
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

function MentorSidebar({
  activeLabel,
}: {
  activeLabel: string;
}) {
  return (
    <Sidebar
      collapsible="icon"
      className="border-primary-100 bg-white/95 backdrop-blur"
    >
      <SidebarHeader className="gap-4 p-4 group-data-[collapsible=icon]:px-2">
        <Link
          href="/mentor/dashboard"
          className="flex w-full origin-center scale-100 items-center justify-center rounded-2xl px-1 py-1 transition-transform duration-300 ease-out group-data-[collapsible=icon]:-translate-x-1 group-data-[collapsible=icon]:scale-50"
        >
          <BrandLockup />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <NavigationGroup
          activeLabel={activeLabel}
          items={kaptenMainNavigation}
          label="Konten Belajar"
        />
        <NavigationGroup
          activeLabel={activeLabel}
          items={kaptenTryoutNavigation}
          label="Tryout"
        />
        <NavigationGroup
          activeLabel={activeLabel}
          items={kaptenUtilityNavigation}
          label="Ruang Kerja"
        />
      </SidebarContent>

    </Sidebar>
  );
}

export { MentorSidebar };

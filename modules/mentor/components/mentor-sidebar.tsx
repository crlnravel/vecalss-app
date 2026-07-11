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
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BrandMark } from "@/modules/home/components/home-primitives";

type KaptenNavigationItem = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
};

const kaptenMainNavigation: KaptenNavigationItem[] = [
  { href: "/mentor/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/mentor/materi", icon: BookOpenText, label: "Materi" },
  { href: "/mentor/quiz", icon: ListChecks, label: "Quiz" },
  {
    href: "/mentor/quiz/question-bank",
    icon: LibraryBig,
    label: "Question Bank",
  },
  { href: "/mentor/tryout", icon: Gauge, label: "Tryout" },
];

const kaptenUtilityNavigation: KaptenNavigationItem[] = [
  { href: "/mentor/media", icon: ImageIcon, label: "Media" },
  { href: "/mentor/settings", icon: Settings, label: "Pengaturan" },
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
  footerLabel,
  fullName,
}: {
  activeLabel: string;
  footerLabel: string;
  fullName: string;
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
        <NavigationGroup
          activeLabel={activeLabel}
          items={kaptenMainNavigation}
          label="Konten Belajar"
        />
        <NavigationGroup
          activeLabel={activeLabel}
          items={kaptenUtilityNavigation}
          label="Workspace"
        />
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
                {fullName}
              </p>
              <p className="truncate text-xs text-secondary-500">
                {footerLabel}
              </p>
            </div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export { MentorSidebar, getInitials };

"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
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
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { BrandLockup, BrandMark } from "@/modules/home/components/home-primitives";

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
  appearance,
  items,
  label,
}: {
  activeLabel: string;
  appearance: MentorSidebarAppearance;
  items: KaptenNavigationItem[];
  label: string;
}) {
  return (
    <SidebarGroup className={appearance === "reference" ? "mb-2" : undefined}>
      <SidebarGroupLabel
        className={
          appearance === "reference"
            ? "h-auto min-h-8 px-3 py-2 text-ui-xs font-semibold tracking-[0.14em] text-secondary-500 uppercase"
            : undefined
        }
      >
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.label}>
              <SidebarMenuButton
                className={
                  appearance === "reference"
                    ? cn(
                        "h-11 min-h-11 rounded-2xl px-3 text-sm font-medium text-secondary-500 transition-[background-color,color,box-shadow] hover:bg-primary-50/70 hover:text-secondary-900 focus-visible:ring-3 focus-visible:ring-primary-300/35",
                        "data-active:bg-primary-50 data-active:text-primary-800 data-active:shadow-[inset_0_-1px_0_rgba(1,76,56,0.08)]",
                        "group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:p-3!",
                      )
                    : undefined
                }
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

type MentorSidebarAppearance = "default" | "reference";

function MentorSidebar({
  activeLabel,
  appearance = "default",
}: {
  activeLabel: string;
  appearance?: MentorSidebarAppearance;
}) {
  const { isMobile, state } = useSidebar();
  const isReference = appearance === "reference";
  const isCompactReferenceMark = isReference && !isMobile && state === "collapsed";

  return (
    <Sidebar
      collapsible="icon"
      variant={isReference ? "floating" : "sidebar"}
      className={cn(
        "border-primary-100 bg-white/95 backdrop-blur",
        isReference &&
          "border-0 bg-transparent lg:bottom-4 lg:h-auto lg:left-4! lg:top-4 [&>div]:rounded-4xl [&>div]:border [&>div]:border-primary-100 [&>div]:bg-white [&>div]:shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)] [&>div]:ring-0",
      )}
    >
      <SidebarHeader
        className={cn(
          "gap-4 p-4 group-data-[collapsible=icon]:px-2",
          isReference && "mb-2 gap-5 p-3",
        )}
      >
        <Link
          href="/mentor/dashboard"
          className={cn(
            "flex w-full origin-center scale-100 items-center justify-center rounded-2xl transition-[background-color,transform] duration-300 ease-out hover:bg-primary-50",
            isCompactReferenceMark ? "px-0 py-0" : "px-1 py-1",
            !isReference && "group-data-[collapsible=icon]:-translate-x-1 group-data-[collapsible=icon]:scale-50",
          )}
        >
          {isCompactReferenceMark ? <BrandMark compact /> : <BrandLockup />}
        </Link>
      </SidebarHeader>

      <SidebarContent className={isReference ? "gap-0" : undefined}>
        <NavigationGroup
          activeLabel={activeLabel}
          appearance={appearance}
          items={kaptenMainNavigation}
          label="Konten Belajar"
        />
        <NavigationGroup
          activeLabel={activeLabel}
          appearance={appearance}
          items={kaptenTryoutNavigation}
          label="Tryout"
        />
        <NavigationGroup
          activeLabel={activeLabel}
          appearance={appearance}
          items={kaptenUtilityNavigation}
          label="Ruang Kerja"
        />
      </SidebarContent>

      {isReference ? (
        <SidebarFooter className="hidden p-3 md:flex group-data-[collapsible=icon]:px-0!">
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
      ) : null}
    </Sidebar>
  );
}

export { MentorSidebar };
export type { MentorSidebarAppearance };

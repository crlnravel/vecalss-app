"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  Bell,
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
  Gauge,
  LayoutDashboard,
  ListChecks,
  UserRound,
  Video,
} from "@/lib/icons";

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
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { BrandLockup, BrandMark } from "@/modules/home/components/home-primitives";
import { buildAdminStudentPreviewRoute } from "@/lib/student/preview-routes";
import { cn } from "@/lib/utils";

type StudentNavigationItem = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
};

const studentNavigationItems: StudentNavigationItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Beranda" },
  { href: "/courses", icon: BookOpen, label: "Materi" },
  { href: "/videos", icon: Video, label: "Video" },
  { href: "/quiz", icon: ListChecks, label: "Kuis" },
  { href: "/tryout", icon: Gauge, label: "Tryout" },
  { href: "/vera-ai", icon: Bot, label: "Vera AI" },
  { href: "/notifications", icon: Bell, label: "Notifikasi" },
  { href: "/settings", icon: UserRound, label: "Profil" },
];

const previewNavigationItems: StudentNavigationItem[] = [
  { href: "/", icon: LayoutDashboard, label: "Beranda" },
  { href: "/courses", icon: BookOpen, label: "Materi" },
  { href: "/quiz", icon: ListChecks, label: "Kuis" },
  { href: "/tryout", icon: Gauge, label: "Tryout" },
];

type StudentSidebarAppearance = "default" | "reference";

function StudentSidebarBrand({ isCompactReferenceMark, isReference, previewMode }: { isCompactReferenceMark: boolean; isReference: boolean; previewMode: boolean }) {
  return <SidebarHeader className={cn("gap-4 p-4 group-data-[collapsible=icon]:px-2", isReference && "mb-2 gap-5 p-3 group-data-[collapsible=icon]:px-0")}><Link href={previewMode ? buildAdminStudentPreviewRoute() : "/dashboard"} className={cn("flex w-full origin-center scale-100 items-center justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35", !isReference && "transition-[background-color,transform] duration-300 ease-out motion-reduce:transition-none hover:bg-primary-50", isCompactReferenceMark ? "px-0 py-0" : "px-1 py-1", !isReference && "group-data-[collapsible=icon]:-translate-x-1 group-data-[collapsible=icon]:scale-50")}>{isCompactReferenceMark ? <BrandMark compact /> : <BrandLockup />}</Link></SidebarHeader>;
}

function StudentSidebarNavigation({ activeLabel, isReference, notificationBadge, previewMode }: { activeLabel: string; isReference: boolean; notificationBadge?: string; previewMode: boolean }) {
  const navigationItems = previewMode ? previewNavigationItems : studentNavigationItems;
  return (
    <SidebarContent className={isReference ? "gap-0" : undefined}>
      <SidebarGroupLabel
        className={cn(
          "mx-2",
          isReference &&
            "h-auto min-h-8 px-3 py-2 text-ui-xs font-semibold tracking-[0.14em] text-secondary-500 uppercase group-data-[collapsible=icon]:hidden",
        )}
      >
        Belajar
      </SidebarGroupLabel>

      <SidebarGroup
        className={
          isReference
            ? "mb-2 group-data-[collapsible=icon]:mb-0.5! group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-0"
            : undefined
        }
      >
        <SidebarGroupContent>
          <SidebarMenu>
            {navigationItems.map((item) => {
              const badge = !previewMode && item.label === "Notifikasi" ? notificationBadge : undefined;
              const href = previewMode ? buildAdminStudentPreviewRoute(item.href) : item.href;

              return (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    className={
                      isReference
                        ? cn(
                            "h-11 min-h-11 rounded-2xl px-3 text-sm font-medium text-secondary-500 transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none hover:bg-primary-50/70 hover:text-secondary-900 focus-visible:ring-3 focus-visible:ring-primary-300/35",
                            "data-active:bg-primary-50 data-active:text-primary-800 data-active:shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)]",
                            "group-data-[collapsible=icon]:mx-auto! group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:p-0!",
                            item.label === activeLabel &&
                              "group-data-[collapsible=icon]:bg-transparent! group-data-[collapsible=icon]:shadow-none!",
                          )
                        : undefined
                    }
                    isActive={item.label === activeLabel}
                    render={<Link href={href} />}
                    tooltip={item.label}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center [&>svg]:size-4",
                        isReference &&
                          item.label === activeLabel &&
                          "group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:bg-primary-50 group-data-[collapsible=icon]:text-primary-800 group-data-[collapsible=icon]:shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)] [&>svg]:size-5",
                      )}
                    >
                      <item.icon />
                    </span>
                    <span className={isReference ? "group-data-[collapsible=icon]:hidden" : undefined}>
                      {item.label}
                    </span>
                  </SidebarMenuButton>
                  {badge ? (
                    <SidebarMenuBadge className="border border-student-status-attention-border bg-student-status-attention-bg text-student-status-attention-fg">
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
  );
}

function StudentSidebarFooter({ isReference, state }: { isReference: boolean; state: "collapsed" | "expanded" }) {
  if (!isReference) return null;
  return <SidebarFooter className="hidden p-3 md:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0!"><SidebarTrigger aria-label={state === "collapsed" ? "Buka navigasi" : "Ciutkan navigasi"} className={cn("min-h-11 w-full rounded-2xl border border-primary-100 bg-primary-50/60 text-secondary-500 transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none hover:bg-primary-50 hover:text-secondary-900 focus-visible:ring-3 focus-visible:ring-primary-300/35", state === "collapsed" ? "justify-center" : "justify-end px-4", "group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:p-0!")}>{state === "collapsed" ? <ChevronRight aria-hidden="true" className="size-4" /> : <ChevronLeft aria-hidden="true" className="size-4" />}</SidebarTrigger></SidebarFooter>;
}

function StudentSidebar({
  activeLabel,
  appearance = "reference",
  notificationBadge,
  previewMode = false,
}: {
  activeLabel: string;
  appearance?: StudentSidebarAppearance;
  notificationBadge?: string;
  previewMode?: boolean;
}) {
  const { isMobile, state } = useSidebar();
  const isReference = appearance === "reference" && !previewMode;
  const isCompactReferenceMark = isReference && !isMobile && state === "collapsed";

  return (
    <Sidebar
      collapsible="icon"
      variant={isReference ? "floating" : "sidebar"}
      className={cn(
        "border-primary-100 bg-white/95 backdrop-blur",
        isReference &&
          "border-0 bg-transparent lg:bottom-4 lg:h-auto lg:left-4! lg:top-4 [&>div]:rounded-4xl [&>div]:border [&>div]:border-primary-100 [&>div]:bg-white [&>div]:shadow-[0_12px_28px_-24px_color-mix(in_oklab,var(--voyage-deep)_28%,transparent)] [&>div]:ring-0",
      )}
    >
      <StudentSidebarBrand isCompactReferenceMark={isCompactReferenceMark} isReference={isReference} previewMode={previewMode} />
      <StudentSidebarNavigation activeLabel={activeLabel} isReference={isReference} notificationBadge={notificationBadge} previewMode={previewMode} />
      <StudentSidebarFooter isReference={isReference} state={state} />

    </Sidebar>
  );
}

export { StudentSidebar };
export type { StudentSidebarAppearance };

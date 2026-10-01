"use client";

import Link from "next/link";
import type { ComponentType } from "react";

import {
  ChartColumnBig,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
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

type AffiliatorNavigationItem = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
};

const affiliatorNavigation: AffiliatorNavigationItem[] = [
  { href: "/affiliator/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  {
    href: "/affiliator/log-pembelian",
    icon: ChartColumnBig,
    label: "Riwayat pembelian",
  },
];

function AffiliatorSidebar({ activeLabel }: { activeLabel?: string }) {
  const { isMobile, state } = useSidebar();
  const isCompact = !isMobile && state === "collapsed";

  return (
    <Sidebar
      collapsible="icon"
      variant="floating"
      className="border-0 bg-transparent lg:bottom-4 lg:h-auto lg:left-4! lg:top-4 [&>div]:rounded-control [&>div]:border [&>div]:border-primary-100 [&>div]:bg-white [&>div]:shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)] [&>div]:ring-0"
    >
      <SidebarHeader className="mb-2 gap-5 p-3 group-data-[collapsible=icon]:px-0">
        <Link
          href="/affiliator/dashboard"
          className={cn(
            "flex w-full origin-center items-center justify-center rounded-2xl px-1 py-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35",
            isCompact && "px-0 py-0",
          )}
        >
          {isCompact ? <BrandMark compact /> : <BrandLockup />}
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="mb-2 group-data-[collapsible=icon]:mb-0.5! group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-0">
          <SidebarGroupLabel className="h-auto min-h-8 px-3 py-2 text-ui-xs font-semibold tracking-[0.14em] text-secondary-500 uppercase group-data-[collapsible=icon]:hidden">
            Afiliasi
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {affiliatorNavigation.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    className={cn(
                      "h-11 min-h-11 rounded-2xl px-3 text-sm font-medium text-secondary-500 transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none hover:bg-primary-50/70 hover:text-secondary-900 focus-visible:ring-3 focus-visible:ring-primary-300/35",
                      "data-active:bg-primary-50 data-active:text-primary-800 data-active:shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)]",
                      "group-data-[collapsible=icon]:mx-auto! group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:p-0!",
                      item.label === activeLabel &&
                        "group-data-[collapsible=icon]:bg-transparent! group-data-[collapsible=icon]:shadow-none!",
                    )}
                    isActive={item.label === activeLabel}
                    render={<Link href={item.href} />}
                    tooltip={item.label}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center [&>svg]:size-4",
                        item.label === activeLabel &&
                          "group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:bg-primary-50 group-data-[collapsible=icon]:text-primary-800 group-data-[collapsible=icon]:shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)] [&>svg]:size-5",
                      )}
                    >
                      <item.icon />
                    </span>
                    <span className="group-data-[collapsible=icon]:hidden">
                      {item.label}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="hidden p-3 md:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0!">
        <SidebarTrigger
          aria-label={state === "collapsed" ? "Buka navigasi" : "Ciutkan navigasi"}
          className={cn(
            "min-h-11 w-full rounded-2xl border border-primary-100 bg-primary-50/60 text-secondary-500 transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none hover:bg-primary-50 hover:text-secondary-900 focus-visible:ring-3 focus-visible:ring-primary-300/35",
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

export { AffiliatorSidebar };

"use client";

import { usePathname } from "next/navigation";
import { Activity, BarChart3, LayoutDashboard, Server, SlidersHorizontal } from "@/lib/icons";
import { SunkenTabLink, SunkenTabNavigation } from "@/components/ui/sunken-tabs";

export type AiControlPlaneTab = "overview" | "usage" | "providers" | "reliability" | "policies";

const TABS = [
  { id: "overview", label: "Ringkasan", href: "/admin/ai", icon: LayoutDashboard },
  { id: "usage", label: "Pemakaian", href: "/admin/ai/usage", icon: BarChart3 },
  { id: "providers", label: "Penyedia", href: "/admin/ai/providers", icon: Server },
  { id: "reliability", label: "Keandalan", href: "/admin/ai/reliability", icon: Activity },
  { id: "policies", label: "Kebijakan", href: "/admin/ai/policies", icon: SlidersHorizontal },
] as const;

export function AiControlPlaneNav({ activeTab }: { activeTab?: AiControlPlaneTab }) {
  const pathname = usePathname();
  const current = activeTab ?? TABS.find(tab => tab.href === pathname)?.id;
  return (
    <SunkenTabNavigation aria-label="Navigasi Vera AI" className="grid grid-cols-2 sm:grid-cols-3 xl:flex">
      {TABS.map(tab => {
        const selected = tab.id === current;
        const Icon = tab.icon;
        return <SunkenTabLink
          aria-current={selected ? "page" : undefined}
          className="min-w-0 whitespace-nowrap"
          href={tab.href}
          key={tab.id}
          layout="equal"
          selected={selected}
        ><Icon aria-hidden="true" className="size-4" />{tab.label}</SunkenTabLink>;
      })}
    </SunkenTabNavigation>
  );
}

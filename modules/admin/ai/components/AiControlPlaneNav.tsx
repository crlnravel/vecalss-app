"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, LayoutDashboard, Server, ShieldCheck } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type AiControlPlaneTab =
  | "overview"
  | "usage"
  | "reliability"
  | "providers"
  | "policies";

const TABS: Array<{
  id: AiControlPlaneTab;
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "overview", label: "Ringkasan", href: "/admin/ai", icon: LayoutDashboard },
  { id: "usage", label: "Pemakaian", href: "/admin/ai/usage", icon: BarChart3 },
  { id: "reliability", label: "Keandalan", href: "/admin/ai/reliability", icon: Activity },
  { id: "providers", label: "Providers", href: "/admin/ai/providers", icon: Server },
  { id: "policies", label: "Policy", href: "/admin/ai/policies", icon: ShieldCheck },
];

function resolveActiveTab(pathname: string, activeTab?: AiControlPlaneTab) {
  if (activeTab) return activeTab;
  if (pathname === "/admin/ai") return "overview";
  if (pathname.startsWith("/admin/ai/usage")) return "usage";
  if (pathname.startsWith("/admin/ai/reliability")) return "reliability";
  if (pathname.startsWith("/admin/ai/providers")) return "providers";
  if (pathname.startsWith("/admin/ai/policies")) return "policies";
  return "overview";
}

export function AiControlPlaneNav({ activeTab }: { activeTab?: AiControlPlaneTab }) {
  const pathname = usePathname();
  const currentTab = resolveActiveTab(pathname, activeTab);

  return (
    <nav
      aria-label="Navigasi control plane Vera AI"
      className="flex w-full border-b border-primary-100 bg-transparent"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === currentTab;
        const Icon = tab.icon;

        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-label={tab.label}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-2 py-3 text-sm font-semibold transition-all duration-150 relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 -mb-px min-h-[44px]",
              isActive
                ? "border-b-2 border-primary-800 text-primary-950 font-bold"
                : "text-secondary-500 hover:text-secondary-900 border-b-2 border-transparent hover:border-primary-200",
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn("size-4 shrink-0", isActive ? "text-primary-800" : "text-secondary-400")}
            />
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

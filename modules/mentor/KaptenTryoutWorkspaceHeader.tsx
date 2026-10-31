"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { buildTryoutWorkspaceHref } from "@/lib/navigation/mentor-tryout-continuity";

import { BarChart3, CalendarDays, ClipboardList, Lock, Settings } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type TryoutWorkspaceTab =
  | "subtests"
  | "operations"
  | "participants"
  | "settings";
type PrimaryNavigationEvent = {
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  preventDefault: () => void;
  shiftKey: boolean;
};

const workspaceTabs: Array<{ label: string; value: TryoutWorkspaceTab; icon: typeof ClipboardList }> = [
  { label: "Subtes", value: "subtests", icon: ClipboardList },
  { label: "Operasional", value: "operations", icon: CalendarDays },
  { label: "Hasil", value: "participants", icon: BarChart3 },
  { label: "Pengaturan", value: "settings", icon: Settings },
];

function handlePrimaryNavigation(
  event: PrimaryNavigationEvent,
  href: string,
  onNavigate?: (href: string, event: PrimaryNavigationEvent) => void,
) {
  if (
    event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
  ) return;
  onNavigate?.(href, event);
}

function TryoutWorkspaceHeader({
  actions,
  activeTab,
  children,
  id,
  locked = false,
  onTabChange,
  onNavigate,
  parentId,
  showTabs = true,
  showTitle = true,
  title,
}: {
  actions?: ReactNode;
  activeTab: TryoutWorkspaceTab;
  children?: ReactNode;
  id: string;
  locked?: boolean;
  onTabChange?: (tab: TryoutWorkspaceTab) => void;
  onNavigate?: (href: string, event: PrimaryNavigationEvent) => void;
  parentId?: string;
  showTabs?: boolean;
  showTitle?: boolean;
  title: string;
}) {
  const query = useSearchParams();
  return (
    <div className="grid min-w-0 gap-5">
      {showTitle ? (
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="min-w-0 break-words font-heading text-2xl font-semibold tracking-[-0.03em] text-secondary-900 sm:text-3xl">
                  {title}
                </h1>
                {locked ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        render={(
                          <Button
                            aria-label="Konfigurasi Tryout terkunci"
                            size="icon"
                            type="button"
                            variant="quiet"
                          />
                        )}
                      >
                        <Lock aria-hidden="true" className="size-4" />
                      </TooltipTrigger>
                      <TooltipContent>Peserta sudah memulai Tryout ini, Anda tidak dapat mengubah konfigurasi kembali</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null}
              </div>
            </div>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}

      {children}

      {showTabs ? (
        <nav aria-label="Bagian Tryout" className="flex w-full border-b border-primary-100 bg-transparent">
          {workspaceTabs.map((tab) => {
            const href = buildTryoutWorkspaceHref(id, tab.value, { ...Object.fromEntries(query.entries()), ...(parentId ? { parent: parentId } : {}) });
            const active = activeTab === tab.value;
            const Icon = tab.icon;
            const className = cn(
              "relative -mb-px flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-1 border-b-2 px-1 py-3 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-reduce:transition-none sm:flex-row sm:gap-2 sm:px-3 sm:text-sm",
              active ? "border-primary-800 text-primary-950 font-bold" : "border-transparent text-secondary-500 hover:border-primary-200 hover:text-secondary-900",
            );
            const content = <><Icon aria-hidden="true" className={cn("size-4 shrink-0", active ? "text-primary-800" : "text-secondary-400")} /><span className="max-w-full break-words text-center">{tab.label}</span></>;
            if (onTabChange) {
              return (
                <button
                  aria-pressed={active}
                  className={className}
                  key={tab.value}
                  onClick={() => onTabChange(tab.value)}
                  type="button"
                >
                  {content}
                </button>
              );
            }
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={className}
                href={href}
                key={tab.value}
                onClick={(event) => handlePrimaryNavigation(event, href, onNavigate)}
              >
                {content}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

export { TryoutWorkspaceHeader };
export type { TryoutWorkspaceTab };

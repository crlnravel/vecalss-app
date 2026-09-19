"use client";

import Link from "next/link";
import { type ReactNode } from "react";

import { ChevronLeft, Lock } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type TryoutWorkspaceTab =
  | "identity"
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

const workspaceTabs: Array<{ label: string; value: TryoutWorkspaceTab }> = [
  { label: "Informasi", value: "identity" },
  { label: "Subtest", value: "subtests" },
  { label: "Operasional", value: "operations" },
  { label: "Peserta", value: "participants" },
  { label: "Pengaturan", value: "settings" },
];

function workspaceHref(
  id: string,
  tab: TryoutWorkspaceTab,
  parentId?: string,
) {
  const encodedId = encodeURIComponent(id);
  const parentSuffix = parentId ? `&parent=${encodeURIComponent(parentId)}` : "";
  if (tab === "identity") {
    return parentId
      ? `/mentor/tryout/${encodedId}?parent=${encodeURIComponent(parentId)}`
      : `/mentor/tryout/${encodedId}`;
  }
  if (tab === "subtests") return `/mentor/tryout/${encodedId}?workspace=sections${parentSuffix}`;
  const workspace = tab === "participants" ? "participants" : tab;
  return `/mentor/tryout/${encodedId}?workspace=${workspace}${parentSuffix}`;
}

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
  backHref = "/mentor/tryout",
  backLabel = "Kembali ke semua Tryout",
  id,
  locked = false,
  onTabChange,
  onNavigate,
  parentId,
  showTabs = true,
  title,
}: {
  actions?: ReactNode;
  activeTab: TryoutWorkspaceTab;
  backHref?: string;
  backLabel?: string;
  id: string;
  locked?: boolean;
  onTabChange?: (tab: TryoutWorkspaceTab) => void;
  onNavigate?: (href: string, event: PrimaryNavigationEvent) => void;
  parentId?: string;
  showTabs?: boolean;
  title: string;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            aria-label={backLabel}
            className="mt-1 min-h-11 min-w-11 shrink-0 rounded-xl text-secondary-500 hover:bg-primary-50 hover:text-secondary-900"
            nativeButton={false}
            onClick={(event) => handlePrimaryNavigation(event, backHref, onNavigate)}
            render={<Link href={backHref} />}
            size="icon"
            title={backLabel}
            variant="ghost"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </Button>
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
                          className="size-8 rounded-full text-secondary-500 hover:bg-primary-50 hover:text-secondary-900"
                          size="icon"
                          type="button"
                          variant="ghost"
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

      {showTabs ? (
        <nav aria-label="Bagian Tryout" className="grid grid-cols-5 border-b border-primary-100">
          {workspaceTabs.map((tab) => {
            const href = workspaceHref(id, tab.value, parentId);
            const active = activeTab === tab.value;
            const className = cn(
              "flex min-h-11 min-w-0 items-center justify-center border-b-2 px-1 py-2 text-center text-xs font-medium transition-colors motion-reduce:transition-none sm:px-3 sm:text-sm",
              active
                ? "border-voyage-deep bg-primary-50/70 text-voyage-deep"
                : "border-transparent text-voyage-muted-ink hover:bg-primary-50/60 hover:text-voyage-ink",
              "focus-visible:border-voyage-leaf focus-visible:bg-primary-50 focus-visible:text-voyage-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-voyage-leaf/35",
            );
            if (onTabChange) {
              return (
                <button
                  aria-pressed={active}
                  className={className}
                  key={tab.value}
                  onClick={() => onTabChange(tab.value)}
                  type="button"
                >
                  {tab.label}
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
                {tab.label}
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

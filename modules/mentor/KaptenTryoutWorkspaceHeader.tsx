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
import {
  SunkenTabButton,
  SunkenTabLink,
  SunkenTabNavigation,
} from "@/components/ui/sunken-tabs";

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

const workspaceTabs: Array<{ label: string; value: TryoutWorkspaceTab }> = [
  { label: "Subtes", value: "subtests" },
  { label: "Operasional", value: "operations" },
  { label: "Hasil", value: "participants" },
  { label: "Pengaturan", value: "settings" },
];

function workspaceHref(
  id: string,
  tab: TryoutWorkspaceTab,
  parentId?: string,
) {
  const encodedId = encodeURIComponent(id);
  const parentSuffix = parentId ? `&parent=${encodeURIComponent(parentId)}` : "";
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
  children,
  id,
  locked = false,
  onTabChange,
  onNavigate,
  parentId,
  showBackButton = true,
  showTabs = true,
  showTitle = true,
  title,
}: {
  actions?: ReactNode;
  activeTab: TryoutWorkspaceTab;
  backHref?: string;
  backLabel?: string;
  children?: ReactNode;
  id: string;
  locked?: boolean;
  onTabChange?: (tab: TryoutWorkspaceTab) => void;
  onNavigate?: (href: string, event: PrimaryNavigationEvent) => void;
  parentId?: string;
  showBackButton?: boolean;
  showTabs?: boolean;
  showTitle?: boolean;
  title: string;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      {showTitle ? (
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {showBackButton ? (
              <Button
                aria-label={backLabel}
                className="mt-1 shrink-0"
                nativeButton={false}
                onClick={(event) => handlePrimaryNavigation(event, backHref, onNavigate)}
                render={<Link href={backHref} />}
                size="icon"
                title={backLabel}
                variant="outline"
              >
                <ChevronLeft aria-hidden="true" className="size-5" />
              </Button>
            ) : null}
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
                            size="icon-sm"
                            type="button"
                            variant="outline"
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
        <SunkenTabNavigation aria-label="Bagian Tryout">
          {workspaceTabs.map((tab) => {
            const href = workspaceHref(id, tab.value, parentId);
            const active = activeTab === tab.value;
            const className =
              "!h-auto px-1 text-center text-xs leading-tight sm:px-3 sm:text-sm";
            if (onTabChange) {
              return (
                <SunkenTabButton
                  aria-pressed={active}
                  className={className}
                  key={tab.value}
                  layout="equal"
                  onClick={() => onTabChange(tab.value)}
                  selected={active}
                  type="button"
                >
                  {tab.label}
                </SunkenTabButton>
              );
            }
            return (
              <SunkenTabLink
                aria-current={active ? "page" : undefined}
                className={className}
                href={href}
                key={tab.value}
                layout="equal"
                onClick={(event) => handlePrimaryNavigation(event, href, onNavigate)}
                selected={active}
              >
                {tab.label}
              </SunkenTabLink>
            );
          })}
        </SunkenTabNavigation>
      ) : null}
    </div>
  );
}

export { TryoutWorkspaceHeader };
export type { TryoutWorkspaceTab };

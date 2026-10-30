"use client";

import { type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { buildTryoutWorkspaceHref } from "@/lib/navigation/mentor-tryout-continuity";

import { Lock } from "@/lib/icons";
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
        <SunkenTabNavigation aria-label="Bagian Tryout" className="grid grid-cols-2 sm:flex">
          {workspaceTabs.map((tab) => {
            const href = buildTryoutWorkspaceHref(id, tab.value, { ...Object.fromEntries(query.entries()), ...(parentId ? { parent: parentId } : {}) });
            const active = activeTab === tab.value;
            const className =
              "!h-auto px-3 text-center text-sm leading-tight";
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

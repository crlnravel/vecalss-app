"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { ChevronRight } from "@/lib/icons";
import { cn } from "@/lib/utils";

type DataTableFilterMenuItem = {
  content: ReactNode;
  id: string;
  label: string;
  summary?: ReactNode;
};

type DataTableFilterMenuProps = {
  children?: ReactNode;
  filters: readonly DataTableFilterMenuItem[];
};

const SUBMENU_CLOSE_DELAY_MS = 250;

function DataTableFilterMenu({ children, filters }: DataTableFilterMenuProps) {
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [pinnedFilterId, setPinnedFilterId] = useState<string | null>(null);
  const pinnedFilterIdRef = useRef<string | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();

  function clearCloseTimeout() {
    if (closeTimeoutRef.current !== null) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }

  function scheduleClose(filterId: string) {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      setActiveFilterId((current) =>
        current === filterId ? pinnedFilterIdRef.current : current,
      );
    }, SUBMENU_CLOSE_DELAY_MS);
  }

  useEffect(
    () => () => {
      if (closeTimeoutRef.current !== null) {
        clearTimeout(closeTimeoutRef.current);
      }
    },
    [],
  );

  return (
    <div className="w-full min-w-0">
      <div className="px-2 pb-2">
        <p className="text-sm font-bold text-secondary-900">Filter</p>
      </div>

      <div className="space-y-0.5 py-1.5">
        {filters.map((filter) => {
          const isActive = filter.id === activeFilterId;
          const panelId = `${menuId}-${filter.id}`;

          return (
            <div
              className="relative"
              key={filter.id}
              onMouseMove={(event) => {
                if (event.nativeEvent.movementX === 0 && event.nativeEvent.movementY === 0) {
                  return;
                }

                clearCloseTimeout();
                setActiveFilterId(filter.id);
              }}
              onMouseLeave={() => scheduleClose(filter.id)}
            >
              <button
                aria-controls={panelId}
                aria-expanded={isActive}
                aria-haspopup="dialog"
                aria-pressed={pinnedFilterId === filter.id}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-2.5 py-2 text-left text-sm text-secondary-800 transition-colors motion-reduce:transition-none",
                  "hover:bg-primary-50 hover:text-secondary-900 focus-visible:bg-primary-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/20",
                  isActive && "bg-primary-50/80 text-secondary-900",
                )}
                onClick={() => {
                  clearCloseTimeout();
                  const isAlreadyPinned = pinnedFilterIdRef.current === filter.id;
                  const nextPinnedFilterId = isAlreadyPinned ? null : filter.id;
                  pinnedFilterIdRef.current = nextPinnedFilterId;
                  setPinnedFilterId(nextPinnedFilterId);
                  setActiveFilterId(isAlreadyPinned ? null : filter.id);
                }}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{filter.label}</span>
                  {filter.summary ? (
                    <span className="mt-0.5 block truncate text-xs text-secondary-500">
                      {filter.summary}
                    </span>
                  ) : null}
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-secondary-400"
                />
              </button>

              {isActive ? (
                <div
                  aria-label={`${filter.label} filter`}
                  className="mt-1 w-full rounded-control border border-primary-100 bg-white p-3 text-secondary-900 shadow-[0_16px_36px_-22px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)] outline-none lg:absolute lg:right-full lg:top-0 lg:mt-0 lg:mr-2 lg:w-72"
                  id={panelId}
                  onMouseEnter={() => {
                    clearCloseTimeout();
                    setActiveFilterId(filter.id);
                  }}
                  onMouseLeave={() => scheduleClose(filter.id)}
                  role="group"
                >
                  {filter.content}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {children ? (
        <div className="px-2 pt-3">{children}</div>
      ) : null}
    </div>
  );
}

export { DataTableFilterMenu };
export type { DataTableFilterMenuItem, DataTableFilterMenuProps };

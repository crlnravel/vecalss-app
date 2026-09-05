"use client";

import type { ReactNode } from "react";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import type { AppIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

type ModeCardTabItem<TValue extends string> = {
  description: ReactNode;
  icon: AppIcon;
  id: string;
  label: ReactNode;
  panelId: string;
  value: TValue;
};

type ModeCardTabsProps<TValue extends string> = {
  "aria-label": string;
  className?: string;
  disabled?: boolean;
  items: readonly ModeCardTabItem<TValue>[];
  onValueChange: (value: TValue) => void;
  value: TValue;
};

function ModeCardTabs<TValue extends string>({
  "aria-label": ariaLabel,
  className,
  disabled = false,
  items,
  onValueChange,
  value,
}: ModeCardTabsProps<TValue>) {
  return (
    <TabsPrimitive.Root
      className={cn("w-full", className)}
      onValueChange={(nextValue) => onValueChange(nextValue as TValue)}
      value={value}
    >
      <TabsPrimitive.List
        activateOnFocus
        aria-label={ariaLabel}
        className="grid w-full gap-2 sm:grid-cols-2"
      >
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <TabsPrimitive.Tab
              aria-controls={item.panelId}
              className={cn(
                "group flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left text-secondary-700 transition-[background-color,border-color,box-shadow,color]",
                "border-primary-100 bg-transparent hover:border-primary-300 hover:bg-white/70",
                "data-active:border-primary-500 data-active:bg-white data-active:text-primary-950 data-active:shadow-[0_12px_28px_-24px_rgba(1,76,56,0.8)]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
              disabled={disabled}
              id={item.id}
              key={item.value}
              value={item.value}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-primary-700 transition-colors group-data-[active]:bg-primary-700 group-data-[active]:text-white">
                <Icon aria-hidden="true" size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-secondary-600">
                  {item.description}
                </span>
              </span>
            </TabsPrimitive.Tab>
          );
        })}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}

export type { ModeCardTabItem, ModeCardTabsProps };
export { ModeCardTabs };

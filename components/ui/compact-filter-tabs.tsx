import type { ComponentProps, ReactNode } from "react";

import type { TabsList, TabsTrigger } from "./tabs";
import {
  SunkenTabButton,
  SunkenTabsList,
  SunkenTabsTrigger,
} from "./sunken-tabs";
import { cn } from "@/lib/utils";

type CompactFilterTabItem<TValue extends string> = {
  label: ReactNode;
  value: TValue;
};

type CompactFilterTabsProps<TValue extends string> = {
  "aria-label": string;
  className?: string;
  items: readonly CompactFilterTabItem<TValue>[];
  onValueChange: (value: TValue) => void;
  value: TValue;
};

type CompactTabsListProps = Omit<ComponentProps<typeof TabsList>, "variant">;
type CompactTabsTriggerProps = ComponentProps<typeof TabsTrigger>;

function CompactTabsList({ className, ...props }: CompactTabsListProps) {
  return (
    <SunkenTabsList
      className={className}
      layout="content"
      {...props}
    />
  );
}

function CompactTabsTrigger({ className, ...props }: CompactTabsTriggerProps) {
  return (
    <SunkenTabsTrigger
      className={className}
      layout="content"
      {...props}
    />
  );
}

function CompactFilterTabs<TValue extends string>({
  "aria-label": ariaLabel,
  className,
  items,
  onValueChange,
  value,
}: CompactFilterTabsProps<TValue>) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "flex w-fit max-w-full min-w-0 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      role="group"
    >
      {items.map((item) => {
        const selected = value === item.value;

        return (
          <SunkenTabButton
            aria-pressed={selected}
            key={item.value}
            layout="content"
            onClick={() => onValueChange(item.value)}
            selected={selected}
            type="button"
          >
            {item.label}
          </SunkenTabButton>
        );
      })}
    </div>
  );
}

export type {
  CompactFilterTabItem,
  CompactFilterTabsProps,
  CompactTabsListProps,
  CompactTabsTriggerProps,
};
export { CompactFilterTabs, CompactTabsList, CompactTabsTrigger };

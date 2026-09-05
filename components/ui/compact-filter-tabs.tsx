import type { ComponentProps, ReactNode } from "react";

import { TabsList, TabsTrigger } from "./tabs";
import { cn } from "@/lib/utils";
import { Button } from "./button";

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
    <TabsList
      className={cn(
        "!flex !h-[44px] !w-fit !max-w-full !justify-start !gap-1 !overflow-x-auto !rounded-2xl !bg-transparent !p-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      variant="default"
      {...props}
    />
  );
}

function CompactTabsTrigger({ className, ...props }: CompactTabsTriggerProps) {
  return (
    <TabsTrigger
      className={cn(
        "!h-[44px] !min-h-[44px] !min-w-[44px] !flex-none rounded-full bg-secondary-100 px-4 text-xs font-medium text-secondary-600 transition-[background-color,color,box-shadow] motion-reduce:transition-none data-active:bg-primary-700 data-active:text-white focus-visible:border-primary-700 focus-visible:ring-primary-700/25",
        className,
      )}
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
          <Button
            aria-pressed={selected}
            className="min-h-[44px] min-w-[44px] rounded-full"
            key={item.value}
            onClick={() => onValueChange(item.value)}
            size="default"
            type="button"
            variant={selected ? "brand" : "context"}
          >
            {item.label}
          </Button>
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

import type { ReactNode } from "react";

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
            className="rounded-full"
            key={item.value}
            onClick={() => onValueChange(item.value)}
            size="default"
            variant={selected ? "brand" : "context"}
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}

export type { CompactFilterTabItem, CompactFilterTabsProps };
export { CompactFilterTabs };

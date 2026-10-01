"use client";

import { Minus, Plus } from "@/lib/icons";
import { useState } from "react";

import { cn } from "@/lib/utils";

export interface Item {
  id: string;
  number: string;
  question: string;
  answer: string;
}

export interface AccordionListProps {
  items: Item[];
  /**
   * Allow multiple items to be open simultaneously.
   * @default false
   */
  allowMultiple?: boolean;
  className?: string;
  variant?: "default" | "minimal";
}

export function AccordionList({
  items,
  allowMultiple = false,
  className,
  variant = "default",
}: AccordionListProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(
    () => new Set(items[0] ? [items[0].id] : []),
  );

  function toggleItem(itemId: string) {
    setOpenItems((current) => {
      const next = new Set(current);

      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        if (!allowMultiple) next.clear();
        next.add(itemId);
      }

      return next;
    });
  }

  return (
    <div className={cn("flex flex-col", variant === "default" ? "gap-3" : "divide-y divide-[var(--voyage-deep)]/12", className)}>
      {items.map((item) => {
        const panelId = `accordion-panel-${item.id}`;
        const triggerId = `accordion-trigger-${item.id}`;
        const isOpen = openItems.has(item.id);

        return (
          <div
            key={item.id}
            data-state={isOpen ? "open" : "closed"}
            className={cn(
              variant === "default"
                ? "group overflow-hidden rounded-field border border-[var(--voyage-deep)]/10 bg-[var(--voyage-deep)]/[0.03] px-4 py-4 transition-[background-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_52px_-42px_color-mix(in_oklab,var(--voyage-deep)_30%,transparent)] data-[state=open]:bg-white data-[state=open]:shadow-[0_22px_64px_-50px_color-mix(in_oklab,var(--voyage-deep)_36%,transparent)] md:px-5 md:py-4"
                : "group py-5 md:py-6",
            )}
          >
            <button
              aria-controls={panelId}
              aria-expanded={isOpen}
              className={cn(
                "flex w-full cursor-pointer items-center justify-between gap-6 border-0 bg-transparent p-0 text-left",
                "outline-none focus-visible:ring-4 focus-visible:ring-voyage-deep/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
              )}
              id={triggerId}
              onClick={() => toggleItem(item.id)}
              type="button"
            >
              <div className="flex items-center gap-3 text-[var(--voyage-deep)] md:gap-4">
                <span className="shrink-0 text-ui-sm font-semibold leading-none text-[var(--voyage-deep)] md:text-ui-base">
                  {item.number}
                </span>
                <span className="text-ui-lg font-medium leading-tight md:text-ui-title">
                  {item.question}
                </span>
              </div>

              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center text-[var(--voyage-deep)] transition-transform duration-300 group-data-[state=open]:rotate-180",
                  variant === "default" && "rounded-pill border border-[var(--voyage-deep)]/12 bg-white group-data-[state=open]:border-[var(--voyage-deep)]/30 group-data-[state=open]:bg-[var(--voyage-deep)]/10",
                )}
                aria-hidden="true"
              >
                <Plus className="size-4 group-data-[state=open]:hidden md:size-5" />
                <Minus className="hidden size-4 group-data-[state=open]:block md:size-5" />
              </span>
            </button>

            <div
              aria-hidden={!isOpen}
              aria-labelledby={triggerId}
              data-accordion-panel
              data-state={isOpen ? "open" : "closed"}
              id={panelId}
              role="region"
              className="accordion-panel"
            >
              <div className="overflow-hidden">
                {variant === "default" ? <div className="mt-4 h-px w-full bg-[var(--voyage-deep)]/10" /> : null}
                <p className={cn("text-ui-base text-voyage-ink", variant === "default" ? "pt-4" : "max-w-[62ch] pt-3 pl-9 md:pl-11")}>
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

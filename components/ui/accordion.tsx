"use client";

import { Accordion } from "@base-ui/react/accordion";
import { Plus, X } from "lucide-react";
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
}

export function AccordionList({
  items,
  allowMultiple = false,
  className,
}: AccordionListProps) {
  return (
    <Accordion.Root
      defaultValue={items.length > 0 ? [items[0].id] : []}
      multiple={allowMultiple}
      className={cn("flex flex-col gap-7.5", className)}
    >
      {items.map((item) => (
        <Accordion.Item
          key={item.id}
          value={item.id}
          className={cn(
            "w-full overflow-hidden rounded-[45px] border border-[#191a23]",
            "px-15 py-10.25",
            "shadow-[0px_5px_0px_0px_#191a23]",
            "transition-colors duration-300",
            // Base UI sets data-open / data-closed on the item
            "data-open:bg-primary-200",
            "data-closed:bg-[#f3f3f3]",
          )}
        >
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <Accordion.Header className="flex items-center justify-between">
            <Accordion.Trigger
              // Base UI sets data-panel-open on the trigger when expanded
              className={cn(
                "flex w-full cursor-pointer items-center justify-between gap-6 text-left",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
            >
              <div className="flex items-center gap-6.25 font-space-grotesk font-medium text-black">
                <span className="shrink-0 text-[60px] leading-none">
                  {item.number}
                </span>
                <span className="text-[30px] leading-tight">
                  {item.question}
                </span>
              </div>

              {/*
                Icon circle — uses [[data-panel-open]_&] to detect open state
                from the parent trigger element.
              */}
              <span
                className={cn(
                  "flex size-14.5 shrink-0 items-center justify-center rounded-full",
                  "border border-[#191a23] transition-colors duration-300",
                  // Closed default
                  "bg-transparent text-[#191a23]",
                  // Open: filled circle, white icon
                  "in-data-panel-open:bg-[#191a23]",
                  "in-data-panel-open:text-white",
                )}
                aria-hidden="true"
              >
                <Plus className="size-5 in-data-panel-open:hidden" />
                <X className="size-5 hidden in-data-panel-open:block" />
              </span>
            </Accordion.Trigger>
          </Accordion.Header>

          <Accordion.Panel
            keepMounted
            className={cn(
              "overflow-hidden",
              "h-(--accordion-panel-height) opacity-100",
              "transition-[height,opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]",
              "data-starting-style:h-0 data-starting-style:opacity-0",
              "data-ending-style:h-0 data-ending-style:opacity-0",
            )}
          >
            {/* Divider */}
            <div className="mt-7.5 h-px w-full bg-[#191a23]" />
            {/* Answer */}
            <p className="pt-7.5 font-space-grotesk text-[18px] font-normal leading-relaxed text-black">
              {item.answer}
            </p>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}

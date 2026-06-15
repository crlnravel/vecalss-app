"use client";

import { Accordion } from "@base-ui/react/accordion";
import { Minus, Plus } from "lucide-react";
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
            "px-5 py-5 md:px-15 md:py-10.25",
            "shadow-[0px_5px_0px_0px_#191a23]",
            "transition-colors duration-300",
            "data-open:bg-primary-200",
            "data-closed:bg-[#f3f3f3]",
          )}
        >
          <Accordion.Header className="flex items-center justify-between">
            <Accordion.Trigger
              // Base UI sets data-panel-open on the trigger when expanded
              className={cn(
                "flex w-full cursor-pointer items-center justify-between gap-6 text-left",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
            >
              <div className="flex items-center gap-4 md:gap-6.25 font-space-grotesk font-medium text-black">
                <span className="shrink-0 text-[40px] leading-none md:text-[60px]">
                  {item.number}
                </span>
                <span className="text-[20px] leading-tight md:text-[30px]">
                  {item.question}
                </span>
              </div>

              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full md:size-14.5",
                  "border border-[#191a23] bg-white text-[#191a23] transition-transform duration-300",
                )}
                aria-hidden="true"
              >
                <Plus className="size-4 md:size-5 in-data-panel-open:hidden" />
                <Minus className="size-4 md:size-5 hidden in-data-panel-open:block" />
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
            <div className="mt-5 h-px w-full bg-[#191a23] md:mt-7.5" />
            <p className="pt-5 font-space-grotesk text-[16px] font-normal leading-relaxed text-black md:pt-7.5 md:text-[18px]">
              {item.answer}
            </p>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}

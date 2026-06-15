"use client";

import { Accordion } from "@base-ui/react/accordion";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FaqItem {
  id: string;
  number: string;
  question: string;
  answer: string;
}

export interface FaqAccordionListProps {
  items: FaqItem[];
  /**
   * Allow multiple items to be open simultaneously.
   * @default false
   */
  allowMultiple?: boolean;
  className?: string;
}

// ─── FaqAccordionList ─────────────────────────────────────────────────────────

/**
 * FAQ accordion matching the Figma "Process block" design.
 *
 * Animation: Base UI measures the panel's real pixel height and injects it as
 * `--accordion-panel-height`. We animate `height` from 0 to that value on
 * open (data-starting-style → natural), and back to 0 on close (data-ending-style).
 * This gives a true pixel-perfect smooth ease — no grid-rows hack needed.
 */
export function FaqAccordionList({
  items,
  allowMultiple = false,
  className,
}: FaqAccordionListProps) {
  return (
    <Accordion.Root
      defaultValue={items.length > 0 ? [items[0].id] : []}
      multiple={allowMultiple}
      className={cn("flex flex-col gap-[30px]", className)}
    >
      {items.map((item) => (
        <Accordion.Item
          key={item.id}
          value={item.id}
          className={cn(
            "w-full overflow-hidden rounded-[45px] border border-[#191a23]",
            "px-[60px] py-[41px]",
            "shadow-[0px_5px_0px_0px_#191a23]",
            "transition-colors duration-300",
            // Base UI sets data-open / data-closed on the item
            "data-[open]:bg-primary-200",
            "data-[closed]:bg-[#f3f3f3]",
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
              {/* Number + question */}
              <div className="flex items-center gap-[25px] font-space-grotesk font-medium text-black">
                <span className="shrink-0 text-[60px] leading-none">
                  {item.number}
                </span>
                <span className="text-[30px] leading-tight">{item.question}</span>
              </div>

              {/*
                Icon circle — uses [[data-panel-open]_&] to detect open state
                from the parent trigger element.
              */}
              <span
                className={cn(
                  "flex size-[58px] shrink-0 items-center justify-center rounded-full",
                  "border border-[#191a23] transition-colors duration-300",
                  // Closed default
                  "bg-transparent text-[#191a23]",
                  // Open: filled circle, white icon
                  "[[data-panel-open]_&]:bg-[#191a23]",
                  "[[data-panel-open]_&]:text-white",
                )}
                aria-hidden="true"
              >
                <Plus className="size-5 [[data-panel-open]_&]:hidden" />
                <X    className="size-5 hidden [[data-panel-open]_&]:block" />
              </span>
            </Accordion.Trigger>
          </Accordion.Header>

          {/*
            ── Panel ────────────────────────────────────────────────────────────
            Base UI measures the panel's real scrollHeight and exposes it as the
            CSS variable --accordion-panel-height on this element.

            Animation:
              • Opening  – data-starting-style fires at start of enter, height=0
                           transitions to var(--accordion-panel-height)
              • Closing  – data-ending-style fires at start of exit, height
                           transitions from current to 0
              • overflow-hidden clips content during the transition

            keepMounted keeps the node alive so the exit animation plays.
          */}
          <Accordion.Panel
            keepMounted
            className={cn(
              "overflow-hidden",
              // Animate height using the CSS var Base UI provides
              "h-[var(--accordion-panel-height)] opacity-100",
              "transition-[height,opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]",
              // At the START of entering: height = 0 (browser interpolates up)
              "data-[starting-style]:h-0 data-[starting-style]:opacity-0",
              // At the START of exiting: browser transitions from measured height to 0
              "data-[ending-style]:h-0 data-[ending-style]:opacity-0",
            )}
          >
            {/* Divider */}
            <div className="mt-[30px] h-px w-full bg-[#191a23]" />
            {/* Answer */}
            <p className="pt-[30px] font-space-grotesk text-[18px] font-normal leading-relaxed text-black">
              {item.answer}
            </p>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}

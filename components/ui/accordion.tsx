import { Minus, Plus } from "@/lib/icons";

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
    <div className={cn("flex flex-col gap-3", className)}>
      {items.map((item, index) => {
        const panelId = `accordion-panel-${item.id}`;

        return (
          <details
            key={item.id}
            className={cn(
              "group overflow-hidden rounded-2xl border border-[#014C38]/10 bg-[#014C38]/[0.03] px-4 py-4 transition-[background-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_52px_-42px_rgba(1,76,56,0.3)] md:px-5 md:py-4",
              "open:bg-white open:shadow-[0_22px_64px_-50px_rgba(1,76,56,0.36)]",
            )}
            name={allowMultiple ? undefined : "faq-accordion"}
            open={index === 0}
          >
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center justify-between gap-6 text-left",
                "outline-none [&::-webkit-details-marker]:hidden",
              )}
            >
              <div className="flex items-center gap-3 text-[#014C38] md:gap-4">
                <span className="shrink-0 text-ui-sm font-semibold leading-none text-[#014C38] md:text-ui-base">
                  {item.number}
                </span>
                <span className="text-ui-lg font-medium leading-tight md:text-ui-title">
                  {item.question}
                </span>
              </div>

              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#014C38]/12 bg-white text-[#014C38] transition-[transform,background-color,border-color] duration-300 group-open:rotate-180 group-open:border-[#014C38]/30 group-open:bg-[#014C38]/10"
                aria-hidden="true"
              >
                <Plus className="size-4 group-open:hidden md:size-5" />
                <Minus className="hidden size-4 group-open:block md:size-5" />
              </span>
            </summary>

            <div
              id={panelId}
              className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out group-open:grid-rows-[1fr]"
            >
              <div className="overflow-hidden">
                <div className="mt-4 h-px w-full bg-[#014C38]/10" />
                <p className="pt-4 text-ui-base text-[#014C38]/70">
                  {item.answer}
                </p>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}

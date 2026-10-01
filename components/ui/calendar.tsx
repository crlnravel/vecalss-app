"use client";

import { DayPicker, type ChevronProps, type DayPickerProps } from "react-day-picker";

import { ChevronDown, ChevronLeft, ChevronRight } from "@/lib/icons";
import { cn } from "@/lib/utils";

function Calendar({ className, classNames, components, ...props }: DayPickerProps) {
  return (
    <DayPicker
      className={cn("w-fit", className)}
      classNames={{
        root: "w-fit",
        months: "flex flex-col gap-2",
        month: "space-y-2",
        month_caption: "relative flex h-7 items-center justify-center px-7",
        caption_label: "text-xs font-semibold text-secondary-900",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: "inline-flex size-6 items-center justify-center rounded-detail text-secondary-500 transition-colors hover:bg-primary-50 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-primary-300",
        button_next: "inline-flex size-6 items-center justify-center rounded-detail text-secondary-500 transition-colors hover:bg-primary-50 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-primary-300",
        month_grid: "border-collapse",
        weekdays: "flex",
        weekday: "w-8 text-center text-xs font-semibold text-secondary-500",
        week: "mt-1 flex w-full",
        day: "relative size-8 p-0 text-center text-xs",
        day_button: "inline-flex size-8 items-center justify-center rounded-detail text-xs text-secondary-800 transition-colors hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-primary-300",
        selected: "bg-primary-700 text-white hover:bg-primary-800",
        range_start: "rounded-l-detail bg-primary-700 text-white",
        range_middle: "rounded-none bg-primary-50 text-primary-900",
        range_end: "rounded-r-detail bg-primary-700 text-white",
        today: "font-semibold text-primary-700",
        outside: "text-secondary-300 opacity-50",
        disabled: "text-secondary-300 opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        ...components,
        Chevron: ({ className: chevronClassName, orientation, size, style }: ChevronProps) => {
          const Icon = orientation === "left"
            ? ChevronLeft
            : orientation === "up" || orientation === "down"
            ? ChevronDown
            : ChevronRight;

          return <Icon aria-hidden="true" className={chevronClassName} size={size ?? 16} style={style} />;
        },
      }}
      {...props}
    />
  );
}

export { Calendar };

"use client";

import type { ReactNode } from "react";

import { Select as SelectPrimitive } from "@base-ui/react/select";

import { Check, ChevronDown } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { REFERENCE_CONTROL_CLASS_NAMES } from "./reference-dashboard-tokens";

type ReferenceSelectOption = {
  disabled?: boolean;
  label: ReactNode;
  value: string;
};

type ReferenceSelectProps = {
  "aria-describedby"?: string;
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  onValueChange: (value: string) => void;
  options: readonly ReferenceSelectOption[];
  placeholder?: ReactNode;
  required?: boolean;
  value: string;
};

function ReferenceSelect({
  "aria-describedby": ariaDescribedby,
  "aria-label": ariaLabel,
  className,
  disabled = false,
  id,
  name,
  onValueChange,
  options,
  placeholder = "Pilih opsi",
  required = false,
  value,
}: ReferenceSelectProps) {
  return (
    <SelectPrimitive.Root
      items={options.map(({ label, value: optionValue }) => ({ label, value: optionValue }))}
      name={name}
      onValueChange={(nextValue) => {
        if (typeof nextValue === "string") onValueChange(nextValue);
      }}
      required={required}
      value={value || null}
    >
      <SelectPrimitive.Trigger
        aria-describedby={ariaDescribedby}
        aria-label={ariaLabel}
        className={cn(REFERENCE_CONTROL_CLASS_NAMES.select, className)}
        disabled={disabled}
        id={id}
      >
        <SelectPrimitive.Value className="min-w-0 flex-1 truncate" placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-primary-700" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          alignItemWithTrigger={false}
          className="isolate z-50 outline-none"
          sideOffset={6}
        >
          <SelectPrimitive.Popup className="max-h-(--available-height) min-w-(--anchor-width) overflow-hidden rounded-3xl border border-primary-100 bg-white p-1.5 text-secondary-900 shadow-[0_18px_42px_-30px_rgba(23,107,77,0.5)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <SelectPrimitive.List className="max-h-72 overflow-y-auto">
              {options.map((option) => (
                <SelectPrimitive.Item
                  className="group relative flex w-full cursor-default items-center rounded-2xl px-3 py-2.5 pr-9 text-sm font-medium outline-none data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary-900 data-[selected]:bg-primary-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-45"
                  disabled={option.disabled}
                  key={option.value}
                  value={option.value}
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <span className="pointer-events-none absolute right-3 flex size-4 items-center justify-center text-primary-700">
                    <SelectPrimitive.ItemIndicator>
                      <Check aria-hidden="true" className="size-4" />
                    </SelectPrimitive.ItemIndicator>
                  </span>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export { ReferenceSelect };
export type { ReferenceSelectOption };

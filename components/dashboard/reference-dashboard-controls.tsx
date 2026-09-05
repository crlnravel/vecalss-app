"use client";

import type { AriaAttributes, ReactNode } from "react";

import { Select as SelectPrimitive } from "@base-ui/react/select";

import { Check, ChevronDown } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { REFERENCE_CONTROL_CLASS_NAMES } from "./reference-dashboard-tokens";

type ReferenceSelectOption = {
  disabled?: boolean;
  label: ReactNode;
  value: string;
};

type ReferenceSelectClassNames = {
  icon?: string;
  item?: string;
  popup?: string;
  trigger?: string;
};

type ReferenceSelectProps = {
  "aria-describedby"?: string;
  "aria-label"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  className?: string;
  classNames?: ReferenceSelectClassNames;
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
  "aria-invalid": ariaInvalid,
  className,
  classNames,
  disabled = false,
  id,
  name,
  onValueChange,
  options,
  placeholder = "Pilih opsi",
  required = false,
  value,
}: ReferenceSelectProps) {
  const toInternalValue = (optionValue: string) => (optionValue === "" ? null : optionValue);

  return (
    <SelectPrimitive.Root
      items={options.map(({ label, value: optionValue }) => ({ label, value: toInternalValue(optionValue) }))}
      disabled={disabled}
      id={id}
      name={name}
      onValueChange={(nextValue) => {
        if (nextValue === null) onValueChange("");
        else if (typeof nextValue === "string") onValueChange(nextValue);
      }}
      required={required}
      value={toInternalValue(value)}
    >
      <SelectPrimitive.Trigger
        aria-describedby={ariaDescribedby}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        className={cn(REFERENCE_CONTROL_CLASS_NAMES.select, classNames?.trigger, className)}
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
          <SelectPrimitive.Popup className={cn("max-h-(--available-height) min-w-(--anchor-width) overflow-hidden rounded-3xl border border-primary-100 bg-white p-1.5 text-secondary-900 shadow-[0_18px_42px_-30px_color-mix(in_oklab,var(--voyage-forest)_50%,transparent)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", classNames?.popup)}>
            <SelectPrimitive.List className="max-h-72 overflow-y-auto">
              {options.map((option) => option.disabled ? (
                <div
                  aria-disabled="true"
                  aria-selected="false"
                  className={cn("relative flex w-full items-center rounded-2xl px-3 py-2.5 pr-9 text-sm font-medium opacity-45", classNames?.item)}
                  data-disabled="true"
                  key={option.value}
                  role="option"
                >
                  {option.label}
                </div>
              ) : (
                <SelectPrimitive.Item
                  className={cn("group relative flex w-full cursor-default items-center rounded-2xl px-3 py-2.5 pr-9 text-sm font-medium outline-none data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary-900 data-[selected]:bg-primary-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-45", classNames?.item)}
                  key={option.value}
                  value={toInternalValue(option.value)}
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <span className={cn("pointer-events-none absolute right-3 flex size-4 items-center justify-center text-primary-700", classNames?.icon)}>
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
export type { ReferenceSelectClassNames, ReferenceSelectOption, ReferenceSelectProps };

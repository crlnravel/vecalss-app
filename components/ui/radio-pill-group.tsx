import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";

import { cn } from "@/lib/utils";

export type RadioPillOption<TValue extends string = string> = {
  label: string;
  value: TValue;
};

type RadioPillGroupProps<TValue extends string> = {
  className?: string;
  defaultValue?: TValue;
  name: string;
  onValueChange?: (value: TValue) => void;
  options: readonly RadioPillOption<TValue>[];
  value?: TValue;
};

function RadioPillGroup<TValue extends string>({
  className,
  defaultValue,
  name,
  onValueChange,
  options,
  value,
}: RadioPillGroupProps<TValue>) {
  return (
    <RadioGroup<TValue>
      className={cn("flex flex-wrap items-center gap-6", className)}
      defaultValue={defaultValue}
      name={name}
      onValueChange={onValueChange}
      value={value}
    >
      {options.map((option) => (
        <div
          key={option.value}
          className="inline-flex items-center gap-3 text-lg text-primary-900"
        >
          <Radio.Root
            aria-label={option.label}
            className="inline-flex size-7 items-center justify-center rounded-pill border border-primary-900 bg-white text-primary-900 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/30"
            value={option.value}
          >
            <Radio.Indicator className="size-3 rounded-pill bg-primary-200" />
          </Radio.Root>
          <span>{option.label}</span>
        </div>
      ))}
    </RadioGroup>
  );
}

export { RadioPillGroup };

"use client";

import type { AriaAttributes, ReactNode } from "react";

import { CircleHelp } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "./reference-dashboard-tokens";
import {
  ReferenceSelect,
  type ReferenceSelectOption,
  type ReferenceSelectProps,
} from "./reference-dashboard-controls";

type ReferenceSelectFieldProps = Omit<ReferenceSelectProps, "aria-describedby" | "aria-invalid" | "aria-label"> & {
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  error?: string;
  help?: string;
  label?: ReactNode;
};

function ReferenceSelectField({
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
  className,
  error,
  help,
  label,
  ...props
}: ReferenceSelectFieldProps) {
  const errorId = props.id && error ? `${props.id}-error` : undefined;
  const describedby = [ariaDescribedby, errorId].filter(Boolean).join(" ") || undefined;
  const invalid = ariaInvalid ?? Boolean(error);
  const select = (
    <ReferenceSelect
      {...props}
      aria-describedby={describedby}
      aria-invalid={invalid}
      aria-label={ariaLabel}
      className={className}
    />
  );

  if (label === undefined) return select;

  return (
    <Field>
      <div className="flex items-center gap-1.5">
        <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={props.id}>
          {label}
        </FieldLabel>
        {help ? (
          <Tooltip>
            <TooltipTrigger render={<Button aria-label={`${ariaLabel ?? "Field"} guidance`} size="icon-xs" type="button" variant="ghost" />}>
              <CircleHelp aria-hidden="true" size={15} />
            </TooltipTrigger>
            <TooltipContent>{help}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {select}
      <FieldError error={error} id={errorId ?? `${props.id ?? "select"}-error`} />
    </Field>
  );
}

export { ReferenceSelectField };
export type { ReferenceSelectFieldProps, ReferenceSelectOption };

import { Field as FieldPrimitive } from "@base-ui/react/field";

import { cn } from "@/lib/utils";

const fieldControlClassName =
  "rounded-[14px] border border-primary-900 bg-white px-[30px] py-[18px] text-[18px] text-primary-900 outline-none transition-shadow placeholder:text-secondary-300 focus-visible:ring-2 focus-visible:ring-ring/30";

function Field({
  className,
  ...props
}: React.ComponentProps<typeof FieldPrimitive.Root>) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={cn("flex flex-col gap-[5px] text-primary-900", className)}
      {...props}
    />
  );
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof FieldPrimitive.Label>) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn("text-[16px] leading-7 text-primary-900", className)}
      {...props}
    />
  );
}

function FieldInput({
  className,
  ...props
}: React.ComponentProps<typeof FieldPrimitive.Control>) {
  return (
    <FieldPrimitive.Control
      data-slot="field-input"
      className={cn(fieldControlClassName, className)}
      {...props}
    />
  );
}

function FieldTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="field-textarea"
      className={cn(
        fieldControlClassName,
        "min-h-[190px] resize-none",
        className,
      )}
      {...props}
    />
  );
}

export { Field, FieldInput, FieldLabel, FieldTextarea };

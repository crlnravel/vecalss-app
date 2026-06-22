import { Field as FieldPrimitive } from "@base-ui/react/field";

import { cn } from "@/lib/utils";

const fieldControlClassName =
  "min-w-0 w-full rounded-[18px] border border-secondary-900/14 bg-white px-5 py-4 text-[18px] text-secondary-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] outline-none transition-[border-color,box-shadow,background-color] placeholder:text-secondary-400 focus-visible:border-primary-700/40 focus-visible:ring-4 focus-visible:ring-primary-700/12";

function Field({
  className,
  ...props
}: React.ComponentProps<typeof FieldPrimitive.Root>) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={cn("flex min-w-0 flex-col gap-[5px] text-primary-900", className)}
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

export { Field, FieldInput, FieldLabel, FieldTextarea, fieldControlClassName };

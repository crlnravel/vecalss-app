import { Field as FieldPrimitive } from "@base-ui/react/field";

import { cn } from "@/lib/utils";
import { fieldControlClassName } from "./field-constants";

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
      className={cn("text-base leading-7 text-primary-900", className)}
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

function FieldError({
  error,
  id,
}: {
  error?: string;
  id: string;
}) {
  if (!error) return null;

  return (
    <p className="text-sm leading-5 text-student-status-danger-fg" id={id} role="alert">
      {error}
    </p>
  );
}

export { Field, FieldError, FieldInput, FieldLabel, FieldTextarea };

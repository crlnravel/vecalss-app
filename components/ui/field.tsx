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

function FieldRequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-1 text-destructive">
        *
      </span>
      <span className="sr-only"> (wajib)</span>
    </>
  );
}

function FieldLabel({
  className,
  children,
  required = false,
  ...props
}: React.ComponentProps<typeof FieldPrimitive.Label> & { required?: boolean }) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn("text-base leading-7 text-primary-900", className)}
      {...props}
    >
      {children}
      {required ? <FieldRequiredMark /> : null}
    </FieldPrimitive.Label>
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

export { Field, FieldError, FieldInput, FieldLabel, FieldRequiredMark, FieldTextarea };

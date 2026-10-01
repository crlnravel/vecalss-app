"use client";

import { useState } from "react";
import { Field as FieldPrimitive } from "@base-ui/react/field";

import { Button } from "@/components/ui/button";
import { CircleAlert } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { fieldControlClassName, fieldLabelClassName } from "./field-constants";

function composeClassName<State>(
  baseClassName: string,
  className: string | ((state: State) => string | undefined) | undefined,
) {
  return typeof className === "function"
    ? (state: State) => cn(baseClassName, className(state))
    : cn(baseClassName, className);
}

function Field({
  className,
  ...props
}: React.ComponentProps<typeof FieldPrimitive.Root>) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={composeClassName<FieldPrimitive.Root.State>(
        "flex min-w-0 flex-col gap-[5px] text-primary-900",
        className,
      )}
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
      className={composeClassName<FieldPrimitive.Label.State>(
        fieldLabelClassName,
        className,
      )}
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
      className={composeClassName<FieldPrimitive.Control.State>(
        fieldControlClassName,
        className,
      )}
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

  return <ActiveFieldError error={error} id={id} />;
}

function ActiveFieldError({ error, id }: { error: string; id: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <span className="sr-only" id={id} role="alert">
        {error}
      </span>
      <div className="flex min-h-[44px] items-center">
        <Tooltip open={open} onOpenChange={setOpen}>
          <TooltipTrigger
            closeOnClick={false}
            render={
              <Button
                aria-describedby={id}
                aria-label="Lihat pesan kesalahan"
                className="border-student-status-danger-border text-student-status-danger-fg hover:border-student-status-danger-fg hover:bg-student-status-danger-bg/70 focus-visible:ring-student-status-danger-border/35"
                onClick={() => setOpen(true)}
                size="icon"
                type="button"
                variant="outline"
              >
                <CircleAlert aria-hidden="true" className="size-5" />
              </Button>
            }
          />
          <TooltipContent>{error}</TooltipContent>
        </Tooltip>
      </div>
    </>
  );
}

export { Field, FieldError, FieldInput, FieldLabel, FieldRequiredMark, FieldTextarea };

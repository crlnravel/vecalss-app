import Link from "next/link";
import { ChevronLeft, CircleAlert, CircleHelp } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function OperationalPageHeader({
  backHref,
  description,
  divider = true,
  title,
  trailing,
}: {
  backHref: string;
  description?: string;
  divider?: boolean;
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", divider && "border-b border-primary-100 pb-5")}>
      <div className="flex min-w-0 items-start gap-3">
        <Button
          aria-label="Kembali"
          nativeButton={false}
          render={<Link href={backHref} />}
          size="icon"
          variant="ghost"
        >
          <ChevronLeft />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-secondary-900 sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-secondary-600">{description}</p>
          ) : null}
        </div>
      </div>
      {trailing}
    </header>
  );
}

function OperationNotice({ message, tone = "default" }: { message: string | null; tone?: "default" | "error" }) {
  if (!message) return null;
  return (
    <Alert className="mt-5" role={tone === "error" ? "alert" : "status"} variant={tone === "error" ? "destructive" : "default"}>
      {tone === "error" ? <CircleAlert aria-hidden="true" /> : null}
      <AlertTitle>Status operasi</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function HelpTooltip({ content, label }: { content: string; label: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<Button aria-label={label} size="icon-xs" type="button" variant="ghost" />}>
          <CircleHelp />
        </TooltipTrigger>
        <TooltipContent className="border bg-card text-card-foreground [&>svg]:bg-card [&>svg]:fill-card">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function HelpFieldLabel({ htmlFor, label, required = false, tooltip }: { htmlFor?: string; label: string; required?: boolean; tooltip?: string }) {
  return (
    <div className="flex items-center gap-1">
      <FieldLabel htmlFor={htmlFor}>
        {label}
        {required ? <><span aria-hidden="true" className="text-destructive"> *</span><span className="sr-only"> (wajib)</span></> : null}
      </FieldLabel>
      {tooltip ? <HelpTooltip content={tooltip} label={`Bantuan ${label}`} /> : null}
    </div>
  );
}

function OptionSet<T extends string>({
  label,
  labelTooltip,
  onValueChange,
  options,
  required = false,
  value,
}: {
  label: string;
  labelTooltip?: string;
  onValueChange: (value: T) => void;
  options: Array<{ description?: string; label: string; tooltip?: string; value: T }>;
  required?: boolean;
  value: T;
}) {
  return (
    <Field>
      {labelTooltip ? <HelpFieldLabel label={label} required={required} tooltip={labelTooltip} /> : <FieldLabel>{label}{required ? <><span aria-hidden="true" className="text-destructive"> *</span><span className="sr-only"> (wajib)</span></> : null}</FieldLabel>}
      <RadioGroup
        className="grid gap-2"
        onValueChange={(next) => onValueChange(next as T)}
        value={value}
      >
        {options.map((option) => {
          const id = `${label}-${option.value}`.replaceAll(" ", "-");
          return (
            <Field
              className="flex-row items-start rounded-2xl border border-secondary-900/14 bg-white p-3.5 has-[[data-checked]]:border-primary-700/35 has-[[data-checked]]:bg-primary-50"
              key={option.value}
            >
              <RadioGroupItem id={id} value={option.value} />
              <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                <FieldLabel className="min-w-0 flex-1 cursor-pointer text-sm font-medium leading-5" htmlFor={id}>
                  {option.label}
                  {option.description ? (
                    <span className="mt-1 block text-xs font-normal leading-5 text-secondary-600">
                      {option.description}
                    </span>
                  ) : null}
                </FieldLabel>
                {option.tooltip ? <HelpTooltip content={option.tooltip} label={`Bantuan ${option.label}`} /> : null}
              </div>
            </Field>
          );
        })}
      </RadioGroup>
    </Field>
  );
}

export { HelpFieldLabel, HelpTooltip, OperationalPageHeader, OperationNotice, OptionSet };

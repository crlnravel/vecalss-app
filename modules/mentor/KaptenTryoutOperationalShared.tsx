import Link from "next/link";
import { ChevronLeft, CircleAlert, CircleHelp, ShieldCheck } from "@/lib/icons";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
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
          variant="outline"
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

type AssessmentReleaseSummary = {
  number: number;
  publishedAt: string;
};

const assessmentReleaseDateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeZone: "Asia/Jakarta",
});

function AssessmentReleaseNotice({
  label = "Konten sesi",
  missingDescription = "Buka sesi setelah seluruh tes dan penyesuaian tingkat kesulitan Tryout siap.",
  release,
  state = "current",
}: {
  label?: string;
  missingDescription?: string;
  release: AssessmentReleaseSummary | null;
  state?: "current" | "historical";
}) {
  const historical = state === "historical";
  const publishedAt = release
    ? assessmentReleaseDateFormatter.format(new Date(release.publishedAt))
    : null;

  return (
    <div
      className={cn(
        "mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm leading-6",
        release
          ? historical
            ? "border-[var(--warning-200)] bg-[var(--warning-50)] text-[var(--voyage-warm-sun-ink)]"
            : "border-primary-200 bg-primary-50 text-primary-950"
          : "border-[var(--warning-200)] bg-[var(--warning-50)] text-[var(--voyage-warm-sun-ink)]",
      )}
      role="status"
    >
      {release ? (
        <ShieldCheck aria-hidden="true" className={cn("mt-1 size-5 shrink-0", historical ? "text-[var(--voyage-warm-sun-ink)]" : "text-primary-700")} />
      ) : (
        <CircleAlert aria-hidden="true" className="mt-1 size-5 shrink-0" />
      )}
      <div className="min-w-0">
        <p className="font-semibold">
          {release ? `${label} · Versi konten ${release.number}${historical ? " (versi sebelumnya)" : ""}` : `${label} belum tersedia`}
        </p>
        <p className="mt-0.5 text-xs leading-5 opacity-85">
          {release
            ? historical
              ? "Isi Tryout saat ini mungkin berbeda dari versi ini. Sesi yang sudah dibuka tetap menggunakan versi ini; perubahan berikutnya berlaku untuk sesi baru setelah Tryout diterbitkan lagi."
              : "Peserta yang sudah mulai mengerjakan tetap memakai salinan ini. Perubahan pada Tryout tidak mengubah soal di sesi yang sudah dibuka."
            : missingDescription}
        </p>
        {publishedAt ? (
          <p className="mt-1 text-xs font-medium leading-5 opacity-75">Versi ini diterbitkan {publishedAt}</p>
        ) : null}
      </div>
    </div>
  );
}

function HelpTooltip({ content, label }: { content: string; label: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<Button aria-label={label} size="icon-sm" type="button" variant="outline" />}>
          <CircleHelp />
        </TooltipTrigger>
        <TooltipContent>{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function HelpFieldLabel({ htmlFor, label, required = false, tooltip }: { htmlFor?: string; label: string; required?: boolean; tooltip?: string }) {
  return (
    <div className="flex items-center gap-1">
      <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={htmlFor} required={required}>
        {label}
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
  options: Array<{ description?: string; disabled?: boolean; label: string; tooltip?: string; value: T }>;
  required?: boolean;
  value: T;
}) {
  return (
    <Field>
      {labelTooltip ? <HelpFieldLabel label={label} required={required} tooltip={labelTooltip} /> : <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} required={required}>{label}</FieldLabel>}
      <RadioGroup
        className="grid gap-2"
        onValueChange={(next) => onValueChange(next as T)}
        value={value}
      >
        {options.map((option) => {
          const id = `${label}-${option.value}`.replaceAll(" ", "-");
          return (
            <Field
              className={cn(
                REFERENCE_CONTROL_CLASS_NAMES.choice,
                "flex-row",
                option.description ? "items-start" : "items-center",
                option.disabled && "cursor-not-allowed opacity-55",
              )}
              key={option.value}
            >
              <RadioGroupItem className="border-primary-200 bg-white data-checked:border-primary-700 data-checked:bg-primary-700" disabled={option.disabled} id={id} value={option.value} />
              <div className={cn(
                "flex min-w-0 flex-1 justify-between gap-3",
                option.description ? "items-start" : "items-center",
              )}>
                <FieldLabel className={cn("min-w-0 flex-1 cursor-pointer text-sm font-medium leading-5", option.disabled && "cursor-not-allowed")} htmlFor={id}>
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

export {
  AssessmentReleaseNotice,
  HelpFieldLabel,
  HelpTooltip,
  OperationalPageHeader,
  OptionSet,
};
export type { AssessmentReleaseSummary };

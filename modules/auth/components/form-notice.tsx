import { AlertTriangle, CircleCheckBig, Info } from "@/lib/icons";

import { cn } from "@/lib/utils";

function formNoticeLabel(tone: "danger" | "neutral" | "success", label?: string) {
  return label ?? (tone === "danger" ? "We're sorry" : tone === "success" ? "Saved" : "Note");
}

function FormNoticeIcon({ tone }: { tone: "danger" | "neutral" | "success" }) {
  if (tone === "danger") return <AlertTriangle className="size-4" />;
  if (tone === "success") return <CircleCheckBig className="size-4" />;
  return <Info className="size-4" />;
}

function FormNoticeContent({
  children,
  compact,
  label,
  showLabel,
  tone,
}: {
  children: React.ReactNode;
  compact: boolean;
  label: string;
  showLabel: boolean;
  tone: "danger" | "neutral" | "success";
}) {
  return (
    <div className={cn("flex gap-3", compact ? "items-center justify-center" : "items-start")}>
      <span className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full border",
        compact ? "mt-0" : "mt-0.5",
        compact && "border-transparent bg-transparent text-primary-700",
        !compact && tone === "danger" && `border-student-status-danger-border text-student-status-danger-fg ${showLabel ? "bg-white/72" : "bg-transparent"}`,
        !compact && tone === "neutral" && "border-primary-100/90 bg-white/80 text-primary-700",
        !compact && tone === "success" && "border-student-status-success-border bg-white/80 text-student-status-success-fg",
      )}>
        <FormNoticeIcon tone={tone} />
      </span>
      <div className="min-w-0">
        {compact || !showLabel ? null : <p className="text-sm font-medium tracking-[0.16em] uppercase opacity-80">{label}</p>}
        <div className={showLabel && !compact ? "mt-1" : undefined}>{children}</div>
      </div>
    </div>
  );
}

function FormNotice({
  children,
  compact = false,
  label,
  showLabel = true,
  tone = "neutral",
}: {
  children: React.ReactNode;
  compact?: boolean;
  label?: string;
  showLabel?: boolean;
  tone?: "danger" | "neutral" | "success";
}) {
  const resolvedLabel = formNoticeLabel(tone, label);

  return (
    <div
      aria-live={tone === "danger" ? "assertive" : "polite"}
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "animate-in fade-in-0 slide-in-from-top-1 rounded-4xl border px-4 py-2 text-base leading-7 shadow-[0_16px_36px_-28px_color-mix(in_oklab,var(--voyage-ink)_18%,transparent)] duration-300",
        tone === "danger" &&
          "border-student-status-danger-border bg-student-status-danger-bg text-student-status-danger-fg",
        tone === "neutral" &&
          "border-primary-100 bg-primary-50/60 text-secondary-900",
        tone === "success" &&
          "border-student-status-success-border bg-student-status-success-bg text-student-status-success-fg",
      )}
    >
      <FormNoticeContent compact={compact} label={resolvedLabel} showLabel={showLabel} tone={tone}>{children}</FormNoticeContent>
    </div>
  );
}

export { FormNotice };

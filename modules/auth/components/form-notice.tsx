import { AlertTriangle, CircleCheckBig, Info } from "@/lib/icons";

import { cn } from "@/lib/utils";

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
  const Icon =
    tone === "danger"
      ? AlertTriangle
      : tone === "success"
        ? CircleCheckBig
        : Info;
  const resolvedLabel =
    label ?? (tone === "danger" ? "We're sorry" : tone === "success" ? "Saved" : "Note");

  return (
    <div
      aria-live={tone === "danger" ? "assertive" : "polite"}
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "animate-in fade-in-0 slide-in-from-top-1 rounded-4xl border px-4 py-2 text-base leading-7 shadow-[0_16px_36px_-28px_rgba(11,18,45,0.18)] duration-300",
        tone === "danger" &&
          "border-student-status-danger-border bg-student-status-danger-bg text-student-status-danger-fg",
        tone === "neutral" &&
          "border-primary-100 bg-primary-50/60 text-secondary-900",
        tone === "success" &&
          "border-student-status-success-border bg-student-status-success-bg text-student-status-success-fg",
      )}
    >
      <div className={cn("flex gap-3", compact ? "items-center justify-center" : "items-start")}>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full border",
            compact ? "mt-0" : "mt-0.5",
            compact && "border-transparent bg-transparent text-primary-700",
            !compact &&
              tone === "danger" &&
              `border-student-status-danger-border text-student-status-danger-fg ${showLabel ? "bg-white/72" : "bg-transparent"}`,
            !compact &&
              tone === "neutral" &&
              "border-primary-100/90 bg-white/80 text-primary-700",
            !compact &&
              tone === "success" &&
              "border-student-status-success-border bg-white/80 text-student-status-success-fg",
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          {compact || !showLabel ? null : (
            <p className="text-sm font-medium tracking-[0.16em] uppercase opacity-80">
              {resolvedLabel}
            </p>
          )}
          <div className={showLabel && !compact ? "mt-1" : undefined}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export { FormNotice };

import { AlertTriangle, CircleCheckBig, Info } from "lucide-react";

import { cn } from "@/lib/utils";

function FormNotice({
  children,
  compact = false,
  tone = "neutral",
}: {
  children: React.ReactNode;
  compact?: boolean;
  tone?: "danger" | "neutral" | "success";
}) {
  const Icon =
    tone === "danger" ? AlertTriangle : tone === "success" ? CircleCheckBig : Info;
  const label =
    tone === "danger" ? "We're sorry" : tone === "success" ? "Saved" : "Note";

  return (
    <div
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={cn(
        "animate-in fade-in-0 slide-in-from-top-1 rounded-4xl border px-4 py-4 text-base leading-7 shadow-[0_16px_36px_-28px_rgba(11,18,45,0.18)] duration-300",
        tone === "danger" && "border-danger-200 bg-[linear-gradient(180deg,#fff6f6_0%,#fdeeee_100%)] text-danger-700",
        tone === "neutral" && "border-primary-100 bg-[linear-gradient(180deg,#fffaf0_0%,#f6efe1_100%)] text-secondary-900",
        tone === "success" && "border-primary-200 bg-[linear-gradient(180deg,#f7fbf8_0%,#edf6ef_100%)] text-primary-800",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border",
            compact && "border-transparent bg-transparent text-primary-700",
            !compact && tone === "danger" && "border-danger-200/80 bg-white/72 text-danger-600",
            !compact && tone === "neutral" && "border-primary-100/90 bg-white/80 text-primary-700",
            !compact && tone === "success" && "border-primary-200/80 bg-white/80 text-primary-700",
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          {compact ? null : (
            <p className="text-sm font-medium tracking-[0.16em] uppercase opacity-80">
              {label}
            </p>
          )}
          <div className="mt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

export { FormNotice };

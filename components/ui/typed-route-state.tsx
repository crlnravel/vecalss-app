import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  CircleHelp,
  Info,
  LoaderCircle,
  RefreshCw,
  type AppIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import Link from "next/link";

export type RouteStateKind =
  | "archived"
  | "broken"
  | "cached"
  | "demo"
  | "empty"
  | "error"
  | "loading"
  | "no-attempt"
  | "not-found"
  | "unavailable";

type TypedRouteStateProps = {
  as?: "main" | "section";
  children?: ReactNode;
  className?: string;
  context?: string;
  description: string;
  icon?: AppIcon;
  kind: RouteStateKind;
  onRetry?: () => void;
  returnHref?: string;
  returnLabel?: string;
  retryLabel?: string;
  title: string;
};

const defaultIcons: Record<RouteStateKind, AppIcon> = {
  archived: Archive,
  broken: AlertCircle,
  cached: Info,
  demo: Info,
  empty: CircleHelp,
  error: AlertCircle,
  loading: LoaderCircle,
  "no-attempt": CircleHelp,
  "not-found": CircleHelp,
  unavailable: Info,
};

function isAlertState(kind: RouteStateKind) {
  return kind === "broken" || kind === "error";
}

function iconClasses(kind: RouteStateKind) {
  if (kind === "broken" || kind === "error") {
    return "bg-student-status-danger-bg text-student-status-danger-fg";
  }

  if (kind === "unavailable") {
    return "bg-student-status-attention-bg text-student-status-attention-fg";
  }

  if (kind === "archived") {
    return "bg-student-status-info-bg text-student-status-info-fg";
  }

  return "bg-primary-50 text-primary-800";
}

function TypedRouteStateContent({
  children,
  context,
  description,
  icon,
  kind,
  onRetry,
  returnHref,
  returnLabel,
  retryLabel,
  title,
}: Pick<TypedRouteStateProps, "children" | "context" | "description" | "icon" | "kind" | "onRetry" | "returnHref" | "returnLabel" | "retryLabel" | "title">) {
  const Icon = icon ?? defaultIcons[kind];

  return (
    <div className="w-full max-w-xl rounded-card border border-voyage-soft-border bg-voyage-surface p-6 text-left shadow-[0_24px_70px_-44px_rgba(1,76,56,0.3)] sm:p-8">
      <div className={cn("flex size-12 items-center justify-center rounded-field", iconClasses(kind))}>
        <Icon aria-hidden="true" className={cn("size-6", kind === "loading" && "motion-safe:animate-spin")} />
      </div>
      <h1 className="mt-5 font-heading text-2xl font-semibold leading-tight tracking-[-0.03em] text-voyage-ink sm:text-3xl">{title}</h1>
      <p className="mt-3 max-w-[65ch] text-sm leading-6 text-voyage-muted-ink sm:text-base">{description}</p>
      {context ? <p className="mt-3 text-xs font-medium leading-5 text-voyage-muted-ink">{context}</p> : null}
      {children}
      {kind === "loading" ? (
        <div aria-hidden="true" className="mt-6 grid gap-2">
          <span className="h-3 w-3/4 animate-pulse rounded-pill bg-primary-100" />
          <span className="h-3 w-1/2 animate-pulse rounded-pill bg-primary-100" />
        </div>
      ) : null}
      {onRetry || returnHref ? (
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {onRetry ? (
            <Button onClick={onRetry} type="button" variant="default">
              <RefreshCw aria-hidden="true" />
              {retryLabel}
            </Button>
          ) : null}
          {returnHref ? (
            <Button nativeButton={false} render={<Link href={returnHref} />} variant="outline">
              <ArrowLeft aria-hidden="true" />
              {returnLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TypedRouteState({
  as = "main",
  children,
  className,
  context,
  description,
  icon,
  kind,
  onRetry,
  returnHref,
  returnLabel = "Kembali",
  retryLabel = "Coba lagi",
  title,
}: TypedRouteStateProps) {
  const role: "alert" | "status" = isAlertState(kind) ? "alert" : "status";
  const content = <TypedRouteStateContent context={context} description={description} icon={icon} kind={kind} onRetry={onRetry} returnHref={returnHref} returnLabel={returnLabel} retryLabel={retryLabel} title={title}>{children}</TypedRouteStateContent>;

  const containerClassName = cn(
    "grid min-h-[60svh] place-items-center bg-voyage-canvas px-4 py-10 text-voyage-ink sm:px-6",
    className,
  );
  const ariaLabel = `${title}. ${description}`;

  if (as === "section") {
    return (
      <section
        aria-busy={kind === "loading" ? true : undefined}
        aria-label={ariaLabel}
        aria-live={kind === "loading" ? "polite" : undefined}
        className={containerClassName}
        role={role}
      >
        {content}
      </section>
    );
  }

  return (
    <main
      aria-busy={kind === "loading" ? true : undefined}
      aria-label={ariaLabel}
      aria-live={kind === "loading" ? "polite" : undefined}
      className={containerClassName}
      role={role}
    >
      {content}
    </main>
  );
}

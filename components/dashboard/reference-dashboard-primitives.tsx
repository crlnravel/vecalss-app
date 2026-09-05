import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

import {
  Activity,
  ArrowRight,
  CalendarDays,
  Clock3,
  UserRound,
  Zap,
} from "@/lib/icons";
import { MentorBadge } from "@/components/ui/mentor-badge";
import { StudentBadge } from "@/components/ui/student-badge";
import { cn } from "@/lib/utils";

import {
  REFERENCE_ICON_TONE_CLASS_NAMES,
  REFERENCE_STATUS_LABELS,
  REFERENCE_STATUS_TONE_CLASS_NAMES,
  REFERENCE_SURFACE_CLASS_NAMES,
  type ReferenceIconTone,
  type ReferenceStatusTone,
} from "./reference-dashboard-tokens";

type AppIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

type ReferenceSurfaceProps = React.ComponentProps<"div"> & {
  as?: "article" | "aside" | "div" | "section";
  interactive?: boolean;
  variant?: "inset" | "raised";
};

function ReferenceSurface({
  as: Element = "div",
  className,
  interactive = false,
  variant = "raised",
  ...props
}: ReferenceSurfaceProps) {
  return (
    <Element
      data-slot="reference-surface"
      data-variant={variant}
      className={cn(
        REFERENCE_SURFACE_CLASS_NAMES[variant],
        interactive && REFERENCE_SURFACE_CLASS_NAMES.raisedInteractive,
        className,
      )}
      {...props}
    />
  );
}

function ReferencePageHeader({
  actions,
  className,
  description,
  title,
  ...props
}: React.ComponentProps<"header"> & {
  actions?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-4",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 max-w-3xl">
        <h1 className="font-heading text-3xl leading-tight font-semibold tracking-[-0.03em] text-secondary-900 md:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-[60ch] text-sm leading-6 text-secondary-500 md:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

function ReferenceSectionHeading({
  action,
  className,
  description,
  title,
  ...props
}: React.ComponentProps<"div"> & {
  action?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-3",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <h2 className="font-heading text-xl leading-tight font-semibold tracking-[-0.025em] text-secondary-900 md:text-2xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-[52ch] text-sm leading-6 text-secondary-500">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function ReferenceEmptyState({
  action,
  className,
  description,
  icon: Icon,
  title,
  ...props
}: React.ComponentProps<"div"> & {
  action?: ReactNode;
  description?: ReactNode;
  icon?: AppIcon;
  title: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-52 flex-col items-center justify-center px-5 py-10 text-center",
        className,
      )}
      {...props}
    >
      {Icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <Icon aria-hidden={true} className="size-5" />
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-secondary-900">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-[44ch] text-sm leading-6 text-secondary-500">
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
        </div>
      ) : null}
    </div>
  );
}

function ReferenceProgressRing({
  ariaLabel,
  className,
  label,
  size = 64,
  strokeWidth = 4,
  value,
}: {
  ariaLabel?: string;
  className?: string;
  label?: ReactNode;
  size?: number;
  strokeWidth?: number;
  value: number;
}) {
  const normalizedValue = Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (normalizedValue / 100) * circumference;

  return (
    <div
      aria-label={ariaLabel ?? `${Math.round(normalizedValue)}%`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(normalizedValue)}
      className={cn("relative shrink-0", className)}
      role="progressbar"
      style={{ height: size, width: size }}
    >
      <svg
        aria-hidden="true"
        className="-rotate-90"
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        width={size}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="var(--primary-100)"
          strokeWidth={strokeWidth}
        />
        <circle
          className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="var(--primary-700)"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-semibold leading-none text-secondary-900">
          {Math.round(normalizedValue)}%
        </span>
        {label ? (
          <span className="mt-1 text-ui-xs font-semibold tracking-[0.08em] text-secondary-500 uppercase">
            {label}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ReferenceStatGrid({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="reference-stat-grid"
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-3",
        className,
      )}
      {...props}
    />
  );
}

function ReferenceStatCard({
  className,
  href,
  icon: Icon,
  label,
  supportingText,
  value,
}: {
  className?: string;
  href?: string;
  icon?: AppIcon;
  label: ReactNode;
  supportingText?: ReactNode;
  value: ReactNode;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-ui-xs leading-4 font-semibold tracking-[0.1em] text-secondary-500 uppercase">
          {label}
        </span>
        {Icon ? <Icon aria-hidden={true} className="size-4 text-primary-700" /> : null}
      </div>
      <div className="mt-3 flex size-20 items-center justify-center rounded-2xl border border-primary-100 bg-primary-50/70 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--voyage-surface)_80%,transparent),inset_0_-2px_8px_color-mix(in_oklab,var(--voyage-forest)_8%,transparent)]">
        <span className="font-heading text-3xl leading-none font-semibold tracking-[-0.03em] text-secondary-900">
          {value}
        </span>
      </div>
      {supportingText ? (
        <p className="mt-2 text-xs leading-5 text-secondary-500">{supportingText}</p>
      ) : null}
    </>
  );

  const classes = cn(
    REFERENCE_SURFACE_CLASS_NAMES.raised,
    href && REFERENCE_SURFACE_CLASS_NAMES.raisedInteractive,
    "flex min-w-0 flex-col items-center p-4 text-center",
    className,
  );

  if (href) {
    return (
      <Link className={classes} href={href}>
        {content}
      </Link>
    );
  }

  return <div className={classes}>{content}</div>;
}

function ReferenceStatusBadge({
  appearance = "reference",
  className,
  label,
  size = "sm",
  status,
  tone,
}: {
  appearance?: "mentor" | "reference";
  className?: string;
  label?: ReactNode;
  size?: "sm" | "xs";
  status: string;
  tone?: ReferenceStatusTone;
}) {
  const resolvedTone = tone ?? resolveStatusTone(status);
  const Badge = appearance === "mentor" ? MentorBadge : StudentBadge;

  return (
    <Badge
      className={className}
      size={size}
      tone={resolvedTone}
    >
      {label ?? formatStatusLabel(status)}
    </Badge>
  );
}

type ReferenceActivity = {
  description?: ReactNode;
  href?: string;
  icon?: AppIcon;
  id: string;
  label?: ReactNode;
  timestamp?: ReactNode;
  title: ReactNode;
  tone?: ReferenceIconTone;
};

function ReferenceActivityItem({
  activity,
  isLast = false,
}: {
  activity: ReferenceActivity;
  isLast?: boolean;
}) {
  const Icon = activity.icon ?? Activity;
  const tone = activity.tone ?? "neutral";

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-primary-50/45 md:px-5",
        !isLast && "border-b border-primary-100/80",
      )}
      data-activity-id={activity.id}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          REFERENCE_ICON_TONE_CLASS_NAMES[tone],
        )}
      >
        <Icon aria-hidden={true} className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="min-w-0">
          <p className="min-w-0 truncate text-sm font-semibold text-secondary-900">
            {activity.href ? (
              <Link
                className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                href={activity.href}
              >
                {activity.title}
              </Link>
            ) : (
              activity.title
            )}
          </p>
        </div>
        {activity.description ? (
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-secondary-500">
            {activity.description}
          </p>
        ) : null}
        {activity.label ? (
          <span className="mt-1 block text-ui-xs leading-4 font-semibold tracking-[0.1em] text-secondary-400 uppercase">
            {activity.label}
          </span>
        ) : null}
      </div>
      {activity.timestamp ? (
        <span className="shrink-0 self-start text-xs text-secondary-500">
          {activity.timestamp}
        </span>
      ) : null}
    </div>
  );
}

function ReferenceActivityFeed({
  activities,
  className,
  emptyState,
  nextAction,
  title = "Aktivitas",
  viewAllHref,
  viewAllLabel = "Lihat semua",
}: {
  activities: readonly ReferenceActivity[];
  className?: string;
  emptyState?: ReactNode;
  nextAction?: ReactNode;
  title?: ReactNode;
  viewAllHref?: string;
  viewAllLabel?: ReactNode;
}) {
  return (
    <ReferenceSurface
      className={cn("flex min-h-0 flex-col overflow-hidden", className)}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-5 md:px-5">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary-500" />
          <h2 className="text-xs font-semibold tracking-[0.1em] text-secondary-500 uppercase">
            {title}
          </h2>
        </div>
        {viewAllHref ? (
          <Link
            className="inline-flex items-center gap-1 text-xs font-semibold text-secondary-500 transition-colors hover:text-secondary-900"
            href={viewAllHref}
          >
            {viewAllLabel}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        ) : null}
      </div>

      {nextAction ? (
        <div className="mx-4 mt-4 shrink-0 rounded-2xl border border-primary-100 bg-primary-50/70 px-4 py-3 md:mx-5">
          <p className="text-ui-xs font-semibold tracking-[0.1em] text-secondary-500 uppercase">
            Berikutnya
          </p>
          <p className="mt-1 text-sm leading-5 text-secondary-900">{nextAction}</p>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pt-3">
        {activities.length > 0 ? (
          activities.map((activity, index) => (
            <ReferenceActivityItem
              activity={activity}
              isLast={index === activities.length - 1}
              key={activity.id}
            />
          ))
        ) : (
          emptyState ?? (
            <ReferenceEmptyState
              className="min-h-56"
              description="Belum ada aktivitas untuk ditampilkan."
              icon={Activity}
              title="Belum ada aktivitas"
            />
          )
        )}
      </div>
    </ReferenceSurface>
  );
}

function ReferenceGoalProgressRow({
  className,
  href,
  progress,
  status,
  summary,
  title,
}: {
  className?: string;
  href?: string;
  progress: number;
  status?: string;
  summary?: ReactNode;
  title: ReactNode;
}) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-secondary-900">{title}</p>
          {status ? <ReferenceStatusBadge status={status} size="xs" /> : null}
        </div>
        {summary ? <p className="mt-1 text-xs leading-5 text-secondary-500">{summary}</p> : null}
      </div>
      <ReferenceProgressRing
        ariaLabel={`${Math.round(Math.max(0, Math.min(100, progress)))}% selesai`}
        size={56}
        strokeWidth={4}
        value={progress}
      />
    </>
  );

  const isInteractive = Boolean(href);
  const classes = cn(
    "flex min-w-0 items-center gap-3 rounded-2xl border border-primary-100 bg-primary-50/70 px-3.5 py-3",
    isInteractive &&
      "transition-[transform,border-color,box-shadow,background-color] duration-200 hover:border-primary-200 hover:bg-primary-50 motion-safe:hover:-translate-y-0.5 focus-visible:border-primary-400 focus-visible:ring-3 focus-visible:ring-primary-300/35",
    className,
  );

  if (href) {
    return (
      <Link className={classes} href={href}>
        {content}
      </Link>
    );
  }

  return <div className={classes}>{content}</div>;
}

type ReferenceTaskCardProps = {
  assignee?: ReactNode;
  className?: string;
  createdByAi?: boolean;
  deadline?: ReactNode;
  description?: ReactNode;
  estimatedTime?: ReactNode;
  href?: string;
  onClick?: () => void;
  status: string;
  title: ReactNode;
};

function ReferenceTaskCard({
  assignee,
  className,
  createdByAi = false,
  deadline,
  description,
  estimatedTime,
  href,
  onClick,
  status,
  title,
}: ReferenceTaskCardProps) {
  const content = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ReferenceStatusBadge size="xs" status={status} />
        {createdByAi ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-primary-100 bg-primary-50 px-1.5 py-0.5 text-ui-xs font-semibold tracking-[0.05em] text-primary-800 uppercase">
            <Zap aria-hidden="true" className="size-3" />
            AI
          </span>
        ) : null}
      </div>
      <h3 className="mt-2 text-sm font-semibold leading-5 text-secondary-900">{title}</h3>
      {description ? (
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-secondary-500">{description}</p>
      ) : null}
      {assignee || deadline || estimatedTime ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-secondary-500">
          {assignee ? (
            <span className="inline-flex items-center gap-1">
              <UserRound aria-hidden="true" className="size-3.5" />
              {assignee}
            </span>
          ) : null}
          {deadline ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              {deadline}
            </span>
          ) : null}
          {estimatedTime ? (
            <span className="inline-flex items-center gap-1">
              <Clock3 aria-hidden="true" className="size-3.5" />
              {estimatedTime}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const classes = cn(
    REFERENCE_SURFACE_CLASS_NAMES.raised,
    (href || onClick) && REFERENCE_SURFACE_CLASS_NAMES.raisedInteractive,
    "block w-full p-4 text-left",
    className,
  );

  if (href) {
    return (
      <Link className={classes} href={href}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button className={classes} onClick={onClick} type="button">
        {content}
      </button>
    );
  }

  return <article className={classes}>{content}</article>;
}

function formatStatusLabel(status: string) {
  const statusKey = status.trim().toLowerCase().replace(/-+/g, "_");
  const fallbackLabel = status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

  return REFERENCE_STATUS_LABELS[statusKey as keyof typeof REFERENCE_STATUS_LABELS] ?? fallbackLabel;
}

function resolveStatusTone(status: string): ReferenceStatusTone {
  const statusKey = status.trim().toLowerCase().replace(/-+/g, "_");

  return (
    REFERENCE_STATUS_TONE_CLASS_NAMES[
      statusKey as keyof typeof REFERENCE_STATUS_TONE_CLASS_NAMES
    ] ?? "neutral"
  );
}

export {
  ReferenceActivityFeed,
  ReferenceActivityItem,
  ReferenceEmptyState,
  ReferenceGoalProgressRow,
  ReferencePageHeader,
  ReferenceProgressRing,
  ReferenceSectionHeading,
  ReferenceStatCard,
  ReferenceStatGrid,
  ReferenceStatusBadge,
  ReferenceSurface,
  ReferenceTaskCard,
};
export type { ReferenceActivity, ReferenceTaskCardProps };

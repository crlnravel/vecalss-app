import type { ReactNode } from "react";

import { Lock, type AppIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

type AssessmentQuestionMarkerState =
  | "active"
  | "answered"
  | "empty"
  | "flagged"
  | "locked";

type AssessmentQuestionMarker = {
  id?: string;
  number: number;
  state: AssessmentQuestionMarkerState;
};

function AssessmentWorkspace({
  content,
  dialog,
  exitControl,
  footer,
  header,
  navigation,
}: {
  content: ReactNode;
  dialog?: ReactNode;
  exitControl?: ReactNode;
  footer?: ReactNode;
  header: ReactNode;
  navigation?: ReactNode;
}) {
  return (
    <div className="min-h-svh bg-white text-secondary-900">
      {dialog}

      <div className="grid min-h-svh gap-0 lg:grid-cols-[288px_minmax(0,1fr)]">
        <aside className="flex flex-col border-b border-primary-100 bg-[#fcfdfc] lg:border-r lg:border-b-0">
          {exitControl ? (
            <div className="border-b border-primary-100 px-5 py-5">
              <div className="flex items-start">{exitControl}</div>
            </div>
          ) : null}

          {navigation ? <div className="px-5 py-6">{navigation}</div> : null}
        </aside>

        <main className="flex min-h-svh flex-col bg-white">
          {header}
          <div className="flex-1 px-4 py-6 md:px-8 lg:px-10">{content}</div>
          {footer}
        </main>
      </div>
    </div>
  );
}

function AssessmentQuestionNavigation({
  description,
  items,
  label = "Navigasi Soal",
  onSelect,
}: {
  description?: ReactNode;
  items: AssessmentQuestionMarker[];
  label?: ReactNode;
  onSelect: (number: number) => void;
}) {
  return (
    <>
      <p className="text-xs font-semibold tracking-[0.08em] text-secondary-400 uppercase">
        {label}
      </p>
      {description ? <div className="mt-2 text-sm text-secondary-500">{description}</div> : null}
      <div className="mt-4 grid grid-cols-4 gap-2.5">
        {items.map((marker) => (
          <AssessmentQuestionMarker
            key={marker.id ?? marker.number}
            marker={marker}
            onClick={() => onSelect(marker.number)}
          />
        ))}
      </div>
    </>
  );
}

function AssessmentQuestionMarker({
  marker,
  onClick,
}: {
  marker: AssessmentQuestionMarker;
  onClick: () => void;
}) {
  const icon = marker.state === "locked" ? <Lock className="size-4" /> : marker.number;

  return (
    <button
      className={cn(
        "flex h-12 items-center justify-center rounded-2xl border text-sm font-semibold transition-all duration-200",
        marker.state === "active" &&
          "border-primary-300 bg-primary-50 text-primary-800 shadow-[0_12px_28px_-18px_rgba(1,76,56,0.35)]",
        marker.state === "answered" && "border-primary-200 bg-primary-50 text-primary-800",
        marker.state === "flagged" && "border-[#f4dea2] bg-[#fff6d5] text-[#8a6a00]",
        marker.state === "locked" && "border-primary-100 bg-secondary-50 text-secondary-400",
        marker.state === "empty" &&
          "border-primary-100 bg-white text-secondary-500 hover:border-primary-300 hover:bg-primary-50/60",
      )}
      disabled={marker.state === "locked"}
      onClick={onClick}
      type="button"
    >
      {icon}
    </button>
  );
}

function AssessmentIconButton({
  ariaLabel,
  icon: Icon,
  onClick,
}: {
  ariaLabel: string;
  icon: AppIcon;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary-50 text-secondary-600 transition-colors hover:bg-secondary-100"
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4" />
    </button>
  );
}

function AssessmentUtilityPill({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon: AppIcon;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary-50 text-primary-800"
          : "bg-secondary-50 text-secondary-600 hover:bg-primary-50 hover:text-primary-800",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function AssessmentAnswerOption({
  disabled,
  onClick,
  option,
  selected,
}: {
  disabled?: boolean;
  onClick: () => void;
  option: { id: string; key: string; text: ReactNode };
  selected: boolean;
}) {
  return (
    <button
      className={cn(
        "group flex w-full items-start gap-4 rounded-4xl border bg-white px-5 py-5 text-left shadow-none transition-all duration-200 hover:border-primary-300 hover:bg-primary-50/60 focus-visible:ring-3 focus-visible:ring-primary-400/20 focus-visible:outline-none md:px-6",
        selected ? "border-primary-300 bg-primary-50" : "border-primary-100",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
          selected
            ? "border-primary-700 bg-primary-700 text-white"
            : "border-secondary-200 bg-secondary-50 text-secondary-500 group-hover:border-primary-300 group-hover:bg-white",
        )}
      >
        {option.key}
      </span>
      <span className="text-lg leading-[1.85] font-medium text-secondary-800">{option.text}</span>
    </button>
  );
}

export {
  AssessmentAnswerOption,
  AssessmentIconButton,
  AssessmentQuestionMarker,
  AssessmentQuestionNavigation,
  AssessmentUtilityPill,
  AssessmentWorkspace,
};
export type {
  AssessmentQuestionMarker as AssessmentQuestionMarkerItem,
  AssessmentQuestionMarkerState,
};

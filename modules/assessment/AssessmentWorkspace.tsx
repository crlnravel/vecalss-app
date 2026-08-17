import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

import {
  LayoutGrid,
  Lock,
  PenTool,
  RotateCcw,
  Trash2,
  X,
  type AppIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { BrandLockup } from "@/modules/home/components/home-primitives";

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

type AssessmentResultMarkerState = "correct" | "current" | "incorrect" | "neutral" | "unanswered";

function AssessmentWorkspace({
  annotation,
  content,
  dialog,
  exitControl,
  footer,
  header,
  navigation,
}: {
  annotation?: ReactNode;
  content: ReactNode;
  dialog?: ReactNode;
  exitControl?: ReactNode;
  footer?: ReactNode;
  header: ReactNode;
  navigation?: ReactNode;
}) {
  return (
    <div className="relative min-h-svh bg-secondary-50 text-secondary-900">
      {dialog}

      <div className="flex min-h-svh flex-col">
        <div className="relative">
          {exitControl ? (
            <div className="absolute top-1/2 left-4 z-10 -translate-y-1/2 sm:left-6 lg:left-8">
              {exitControl}
            </div>
          ) : null}
          {header}
        </div>

        {navigation ? (
          <div className="border-b border-primary-100 bg-secondary-50 px-4 py-4 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1000px]">{navigation}</div>
          </div>
        ) : null}

        <main className="flex min-h-0 flex-1 flex-col bg-secondary-50">
          <div className="flex-1 px-4 py-8 pb-32 sm:px-6 md:py-10 md:pb-36 lg:px-12 xl:px-16">{content}</div>
          {footer}
        </main>
      </div>

      {annotation}
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeNumber = items.find((marker) => marker.state === "active")?.number;

  useEffect(() => {
    if (activeNumber === undefined) return;
    const activeMarker = scrollRef.current?.querySelector<HTMLElement>(`[data-marker-number="${activeNumber}"]`);
    activeMarker?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeNumber]);

  return (
    <nav aria-label={typeof label === "string" ? label : "Navigasi soal"}>
      <div className="flex min-w-0 items-center gap-5">
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto rounded-full border border-primary-100 bg-secondary-50 px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-center gap-2">
            {items.map((marker) => (
              <AssessmentQuestionMarker
                key={marker.id ?? marker.number}
                marker={marker}
                onClick={() => onSelect(marker.number)}
              />
            ))}
          </div>
        </div>
        <LayoutGrid aria-hidden="true" className="size-6 shrink-0 text-primary-700" />
      </div>
      {description ? <div className="mt-2 hidden text-sm text-secondary-500 md:block">{description}</div> : null}
    </nav>
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
        "flex size-11 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-all duration-200 focus-visible:ring-3 focus-visible:ring-primary-400/30 focus-visible:outline-none",
        marker.state === "active" &&
          "border-primary-400 bg-primary-700 text-white shadow-[0_10px_20px_-14px_rgba(1,76,56,0.75)] ring-2 ring-primary-200 ring-offset-2",
        marker.state === "answered" && "border-primary-300 bg-primary-50 text-primary-800",
        marker.state === "flagged" && "border-student-status-attention-border bg-student-status-attention-bg text-student-status-attention-fg",
        marker.state === "locked" && "border-secondary-200 bg-secondary-100 text-secondary-400",
        marker.state === "empty" &&
          "border-secondary-200 bg-white text-secondary-500 hover:border-primary-300 hover:bg-primary-50/60",
      )}
      disabled={marker.state === "locked"}
      data-marker-number={marker.number}
      onClick={onClick}
      type="button"
    >
      {icon}
    </button>
  );
}

function AssessmentAnnotationOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [color, setColor] = useState("#014c38");
  const [strokes, setStrokes] = useState<Array<{ color: string; points: string[] }>>([]);
  const [activeStroke, setActiveStroke] = useState<string[] | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
      );
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const focusTimer = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [onClose, open]);

  if (!open) return null;

  function pointFor(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return `${event.clientX - bounds.left},${event.clientY - bounds.top}`;
  }

  function beginStroke(event: PointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveStroke([pointFor(event)]);
  }

  function continueStroke(event: PointerEvent<SVGSVGElement>) {
    if (!activeStroke) return;
    setActiveStroke((current) => current ? [...current, pointFor(event)] : current);
  }

  function finishStroke() {
    if (activeStroke && activeStroke.length > 1) {
      setStrokes((current) => [...current, { color, points: activeStroke }]);
    }
    setActiveStroke(null);
  }

  return (
    <div aria-label="Mode coretan" aria-modal="true" className="fixed inset-0 z-50" ref={dialogRef} role="dialog">
      <div className="absolute inset-0 bg-secondary-900/55" />
      <svg
        aria-label="Area coretan"
        className="absolute inset-0 size-full touch-none"
        onPointerCancel={finishStroke}
        onPointerDown={beginStroke}
        onPointerMove={continueStroke}
        onPointerUp={finishStroke}
        role="img"
      >
        {strokes.map((stroke, index) => (
          <polyline
            fill="none"
            key={`${stroke.color}-${index}`}
            points={stroke.points.join(" ")}
            stroke={stroke.color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="5"
          />
        ))}
        {activeStroke ? (
          <polyline
            fill="none"
            points={activeStroke.join(" ")}
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="5"
          />
        ) : null}
      </svg>

      <div className="absolute top-[8.5rem] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-[1.5rem] border border-primary-200 bg-white px-3 py-2 shadow-[0_20px_48px_-20px_rgba(1,76,56,0.55)] sm:top-[12rem]">
        {["#2f6df6", "#dc2626"].map((swatch) => (
          <button
            aria-label={`Gunakan warna ${swatch}`}
            className={cn(
              "size-7 rounded-full border-2 transition-transform focus-visible:ring-3 focus-visible:ring-primary-400/40 focus-visible:outline-none",
              color === swatch ? "scale-110 border-primary-700 ring-2 ring-primary-200" : "border-white shadow-[0_0_0_1px_rgba(16,36,29,0.14)]",
            )}
            key={swatch}
            onClick={() => setColor(swatch)}
            style={{ backgroundColor: swatch }}
            type="button"
          />
        ))}
        <span aria-hidden="true" className="mx-1 h-7 w-px bg-secondary-200" />
        <button
          aria-label="Urungkan coretan terakhir"
          className="inline-flex size-9 items-center justify-center rounded-full text-secondary-600 transition-colors hover:bg-primary-50 hover:text-primary-800 focus-visible:ring-3 focus-visible:ring-primary-400/40 focus-visible:outline-none"
          disabled={!strokes.length}
          onClick={() => setStrokes((current) => current.slice(0, -1))}
          type="button"
        >
          <RotateCcw className="size-5" />
        </button>
        <button
          aria-label="Hapus semua coretan"
          className="inline-flex size-9 items-center justify-center rounded-full text-student-status-danger-fg transition-colors hover:bg-student-status-danger-bg focus-visible:ring-3 focus-visible:ring-student-status-danger-border focus-visible:outline-none"
          disabled={!strokes.length}
          onClick={() => setStrokes([])}
          type="button"
        >
          <Trash2 className="size-5" />
        </button>
        <span aria-hidden="true" className="mx-1 h-7 w-px bg-secondary-200" />
        <button
          aria-label="Tutup mode coretan"
          className="inline-flex size-9 items-center justify-center rounded-full text-secondary-600 transition-colors hover:bg-primary-50 hover:text-primary-800 focus-visible:ring-3 focus-visible:ring-primary-400/40 focus-visible:outline-none"
          onClick={onClose}
          ref={closeButtonRef}
          type="button"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="pointer-events-none absolute right-4 bottom-5 left-4 flex justify-center text-center text-xs font-semibold text-white/90 sm:bottom-7">
        <span className="inline-flex items-center gap-2 rounded-full bg-secondary-900/65 px-4 py-2">
          <PenTool className="size-4" /> Coretan aktif · seret untuk menandai
        </span>
      </div>
    </div>
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
      className="inline-flex size-12 items-center justify-center rounded-full border border-primary-100 bg-transparent text-secondary-600 transition-colors hover:bg-primary-50"
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
        "inline-flex items-center gap-2 rounded-full border border-primary-100 bg-transparent px-5 py-3 text-sm font-medium transition-colors",
        active
          ? "bg-primary-50 text-primary-800"
          : "text-secondary-600 hover:bg-primary-50 hover:text-primary-800",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function AssessmentResultWorkspace({
  children,
  headerActions,
  navigation,
  score,
  scoreLabel = "Skor Akhir",
  summary,
  title,
}: {
  children: ReactNode;
  headerActions?: ReactNode;
  navigation?: ReactNode;
  score: number;
  scoreLabel?: string;
  summary?: ReactNode;
  title: ReactNode;
}) {
  const normalizedScore = Math.max(0, Math.min(100, score));

  return (
    <div className="min-h-svh bg-secondary-50 text-secondary-900">
      <header className="relative grid min-h-20 grid-cols-[1fr_auto_1fr] items-center border-t-4 border-primary-700 border-b border-primary-100 bg-white px-4 py-3 sm:min-h-24 sm:px-8 print:min-h-0 print:border-0 print:px-0 print:py-3">
        <div className="min-w-0">
          <BrandLockup />
        </div>
        <h1 className="max-w-[50vw] truncate text-center text-lg font-semibold leading-tight text-secondary-900 sm:text-2xl">{title}</h1>
        <div className="flex justify-end gap-2 print:hidden">{headerActions}</div>
      </header>

      <div className="grid min-h-[calc(100svh-6rem)] lg:grid-cols-[minmax(280px,25vw)_minmax(0,1fr)_minmax(280px,25vw)] print:block">
        <aside className="flex min-h-full flex-col border-b border-primary-100 bg-white px-5 py-6 sm:px-8 lg:border-r lg:border-b-0 lg:px-8 xl:px-10 print:border-0 print:px-0 print:py-3">
          <div className="flex items-center gap-4 lg:block">
            <div
              aria-label={`${Math.round(normalizedScore)} ${scoreLabel}`}
              className="grid size-28 shrink-0 place-items-center rounded-full p-3 sm:size-36 lg:mx-auto lg:size-44"
              style={{ background: `conic-gradient(var(--primary-700) ${normalizedScore}%, var(--primary-100) 0)` }}
            >
              <div className="grid size-full place-items-center rounded-full border-4 border-white bg-secondary-50 text-center shadow-[inset_0_0_0_1px_rgba(1,76,56,0.08)]">
                <div>
                  <p className="font-mono text-2xl font-bold tabular-nums text-primary-800 sm:text-3xl">{Math.round(normalizedScore)}</p>
                  <p className="mt-1 max-w-20 text-xs font-semibold leading-tight text-secondary-500">{scoreLabel}</p>
                </div>
              </div>
            </div>
            <div className="min-w-0 lg:mt-5 lg:text-center">
              <p className="text-sm font-semibold text-primary-800">Terus berlatih!</p>
            </div>
          </div>

          {summary ? (
            <div className="mt-8 border-t border-primary-100 pt-7 lg:mt-auto">
              <p className="text-center text-base font-semibold text-secondary-800">Ringkasan</p>
              <div className="mt-5">{summary}</div>
            </div>
          ) : null}
        </aside>

        <main className="min-w-0 bg-secondary-50 px-4 py-6 sm:px-8 lg:px-7 xl:px-10 print:bg-white print:px-0 print:py-3">
          <div className="mx-auto w-full max-w-[920px]">{children}</div>
        </main>

        {navigation ? (
        <aside className="border-t border-primary-100 bg-white px-5 py-6 sm:px-8 lg:border-t-0 lg:border-l lg:px-8 xl:px-10 print:hidden">
            {navigation}
        </aside>
        ) : null}
      </div>
    </div>
  );
}

function AssessmentResultNavigation({
  items,
  label = "Navigasi Soal",
  onSelect,
}: {
  items: Array<{ id?: string; number: number; state: AssessmentResultMarkerState }>;
  label?: ReactNode;
  onSelect: (number: number) => void;
}) {
  return (
    <nav aria-label={typeof label === "string" ? label : "Navigasi hasil"}>
      <p className="sr-only">{label}</p>
      <div className="mt-0 grid grid-cols-3 gap-4">
        {items.map((item) => (
          <AssessmentResultMarker
            key={item.id ?? item.number}
            marker={item}
            onClick={() => onSelect(item.number)}
          />
        ))}
      </div>
    </nav>
  );
}

function AssessmentResultMarker({
  marker,
  onClick,
}: {
  marker: { id?: string; number: number; state: AssessmentResultMarkerState };
  onClick: () => void;
}) {
  return (
    <button
      aria-current={marker.state === "current" ? "step" : undefined}
      className={cn(
        "flex aspect-square items-center justify-center rounded-xl border text-sm font-semibold transition-all duration-200 focus-visible:ring-3 focus-visible:ring-primary-400/30 focus-visible:outline-none",
        marker.state === "correct" && "border-student-status-success-border bg-student-status-success-bg text-student-status-success-fg",
        marker.state === "incorrect" && "border-student-status-danger-border bg-student-status-danger-bg text-student-status-danger-fg",
        marker.state === "unanswered" && "border-student-status-danger-border bg-student-status-danger-bg/80 text-student-status-danger-fg",
        marker.state === "neutral" && "border-secondary-200 bg-secondary-100 text-secondary-600",
        marker.state === "current" && "ring-2 ring-primary-700 ring-offset-2",
      )}
      onClick={onClick}
      type="button"
    >
      {marker.number}
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
        "group flex min-h-[6.25rem] w-full items-start gap-4 rounded-[1.75rem] border bg-white px-5 py-5 text-left shadow-none transition-all duration-200 hover:border-primary-300 hover:bg-primary-50/60 focus-visible:ring-3 focus-visible:ring-primary-400/20 focus-visible:outline-none md:px-6",
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
      <span className="text-lg leading-[1.7] font-medium text-secondary-800 sm:text-xl">{option.text}</span>
    </button>
  );
}

export {
  AssessmentAnswerOption,
  AssessmentAnnotationOverlay,
  AssessmentIconButton,
  AssessmentQuestionMarker,
  AssessmentQuestionNavigation,
  AssessmentResultMarker,
  AssessmentResultNavigation,
  AssessmentResultWorkspace,
  AssessmentUtilityPill,
  AssessmentWorkspace,
};
export type {
  AssessmentQuestionMarker as AssessmentQuestionMarkerItem,
  AssessmentQuestionMarkerState,
  AssessmentResultMarkerState,
};

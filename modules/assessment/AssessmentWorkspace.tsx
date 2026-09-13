import { useEffect, useEffectEvent, useRef, useState, type PointerEvent, type ReactNode } from "react";

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
type AssessmentResultMarkerOutcome = "correct" | "incorrect" | "unanswered";

type AssessmentResultMarkerItem = {
  id?: string;
  number: number;
  outcome?: AssessmentResultMarkerOutcome;
  state: AssessmentResultMarkerState;
};

const ANNOTATION_SWATCHES = [
  { color: "var(--student-status-info-fg)", label: "biru informasi" },
  { color: "var(--student-status-danger-fg)", label: "merah kesalahan" },
] as const;

function pointFor(event: PointerEvent<SVGSVGElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return `${event.clientX - bounds.left},${event.clientY - bounds.top}`;
}

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
    <div className="student-page-canvas relative min-h-svh text-secondary-900">
      {dialog}

      <div className="flex min-h-svh flex-col">
        <div className="relative border-b border-primary-100 bg-white">
          <div className="relative">
            {exitControl ? (
              <div className="absolute top-1/2 left-4 z-10 -translate-y-1/2 sm:left-6 lg:left-8">
                {exitControl}
              </div>
            ) : null}
            {header}
          </div>

          {navigation ? (
            <div className="bg-white px-4 pb-2 sm:px-6 lg:px-8">
              <div className="mx-auto w-full max-w-[calc(100vw-2rem)] lg:max-w-[50vw]">{navigation}</div>
            </div>
          ) : null}
        </div>

        <main className="flex min-h-0 flex-1 flex-col">
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  const pickerDialogRef = useRef<HTMLDialogElement>(null);
  const activeNumber = items.find((marker) => marker.state === "active")?.number;

  useEffect(() => {
    if (activeNumber === undefined) return;
    const activeMarker = scrollRef.current?.querySelector<HTMLElement>(`[data-marker-number="${activeNumber}"]`);
    activeMarker?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeNumber]);

  useEffect(() => {
    const dialog = pickerDialogRef.current;
    if (!pickerOpen || !dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [pickerOpen]);

  function closePicker() {
    setPickerOpen(false);
    window.requestAnimationFrame(() => pickerButtonRef.current?.focus());
  }

  function selectFromPicker(number: number) {
    onSelect(number);
    closePicker();
  }

  return (
    <nav aria-label={typeof label === "string" ? label : "Navigasi soal"} className="relative">
      <div className="flex min-w-0 items-center gap-5">
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto rounded-full border border-primary-100 bg-white px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        <button
          aria-expanded={pickerOpen}
          aria-label="Daftar semua soal"
          className={cn(
            "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-primary-700 transition-colors motion-reduce:transition-none focus-visible:ring-3 focus-visible:ring-primary-400/30 focus-visible:outline-none",
            pickerOpen && "bg-primary-700/15",
          )}
          onClick={() => setPickerOpen((open) => !open)}
          ref={pickerButtonRef}
          type="button"
        >
          <LayoutGrid aria-hidden="true" className="size-6" />
        </button>
      </div>
      {description ? <div className="mt-2 hidden text-sm text-secondary-500 md:block">{description}</div> : null}
      {pickerOpen ? (
        <>
          <button
            aria-label="Tutup daftar soal"
            className="fixed inset-0 z-40 cursor-default bg-secondary-900/50"
            onClick={closePicker}
            type="button"
          />
          <dialog
            aria-label="Pilih nomor soal"
            className="fixed inset-auto top-1/2 right-4 bottom-auto left-auto z-50 m-0 max-h-[calc(100svh-2rem)] w-[min(26rem,calc(100vw-2rem))] -translate-y-1/2 overflow-y-auto rounded-[1.5rem] border border-primary-200 bg-secondary-900 p-4 text-white shadow-[0_24px_70px_-28px_color-mix(in_oklab,var(--secondary-900)_65%,transparent)] sm:right-8"
            onCancel={(event) => {
              event.preventDefault();
              closePicker();
            }}
            ref={pickerDialogRef}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Pilih nomor soal</h2>
              <button
                aria-label="Tutup daftar soal"
                className="inline-flex size-11 items-center justify-center rounded-full text-secondary-300 transition-colors motion-reduce:transition-none hover:bg-white/10 hover:text-white focus-visible:ring-3 focus-visible:ring-primary-300/40 focus-visible:outline-none"
                onClick={closePicker}
                type="button"
              >
                <X className="size-6" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-5 gap-2.5 sm:gap-3">
              {items.map((marker) => (
                <AssessmentQuestionPickerMarker
                  key={marker.id ?? marker.number}
                  marker={marker}
                  onClick={() => selectFromPicker(marker.number)}
                />
              ))}
            </div>
          </dialog>
        </>
      ) : null}
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
      aria-current={marker.state === "active" ? "step" : undefined}
      aria-label={`Soal ${marker.number}${marker.state === "answered" ? " (sudah dijawab)" : marker.state === "flagged" ? " (ditandai)" : marker.state === "locked" ? " (terkunci)" : ""}`}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-all duration-200 motion-reduce:transition-none focus-visible:ring-3 focus-visible:ring-primary-400/30 focus-visible:outline-none",
        marker.state === "active" &&
          "border-primary-400 bg-primary-700 text-white shadow-[0_10px_20px_-14px_color-mix(in_oklab,var(--voyage-deep)_75%,transparent)] ring-2 ring-primary-200 ring-offset-2",
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

function AssessmentQuestionPickerMarker({
  marker,
  onClick,
}: {
  marker: AssessmentQuestionMarker;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={marker.state === "active" ? "step" : undefined}
      aria-label={`Soal ${marker.number}${marker.state === "answered" ? " (sudah dijawab)" : marker.state === "flagged" ? " (ditandai)" : marker.state === "locked" ? " (terkunci)" : ""}`}
      className={cn(
        "flex aspect-square min-h-11 min-w-11 items-center justify-center rounded-xl border-2 text-base font-semibold transition-all duration-200 motion-reduce:transition-none focus-visible:ring-3 focus-visible:ring-primary-300/40 focus-visible:outline-none sm:text-lg",
        marker.state === "active" && "border-primary-300 bg-primary-500 text-white shadow-[0_12px_24px_-16px_color-mix(in_oklab,var(--voyage-deep)_80%,transparent)]",
        marker.state === "answered" && "border-primary-200 bg-primary-50 text-primary-800",
        marker.state === "flagged" && "border-student-status-attention-border bg-student-status-attention-bg text-student-status-attention-fg",
        marker.state === "locked" && "border-secondary-700 bg-secondary-800 text-secondary-400",
        marker.state === "empty" && "border-secondary-700 bg-secondary-800 text-secondary-200 hover:border-primary-300 hover:bg-secondary-700",
      )}
      disabled={marker.state === "locked"}
      onClick={onClick}
      type="button"
    >
      {marker.number}
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
  const [color, setColor] = useState("var(--voyage-deep)");
  const [strokes, setStrokes] = useState<Array<{ color: string; points: string[] }>>([]);
  const [activeStroke, setActiveStroke] = useState<string[] | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseEvent = useEffectEvent(onClose);

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCloseEvent();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
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
    dialog.addEventListener("cancel", handleCancel);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      dialog.removeEventListener("cancel", handleCancel);
      window.removeEventListener("keydown", handleKeyDown);
      if (dialog.open) dialog.close();
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [open]);

  if (!open) return null;

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
    <dialog
      aria-label="Mode coretan"
      className="fixed inset-0 z-50 m-0 h-full w-full max-w-none border-0 bg-transparent p-0"
      ref={dialogRef}
    >
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

      <div className="absolute top-[8.5rem] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-[1.5rem] border border-primary-200 bg-white px-3 py-2 shadow-[0_20px_48px_-20px_color-mix(in_oklab,var(--voyage-deep)_55%,transparent)] sm:top-[12rem]">
        {ANNOTATION_SWATCHES.map((swatch) => (
          <button
            aria-label={`Gunakan warna ${swatch.label}`}
            className={cn(
              "size-11 rounded-full border-2 transition-transform motion-safe:scale-100 motion-reduce:scale-100 motion-reduce:transition-none focus-visible:ring-3 focus-visible:ring-primary-400/40 focus-visible:outline-none",
              color === swatch.color ? "motion-safe:scale-110 border-primary-700 ring-2 ring-primary-200" : "border-white shadow-[0_0_0_1px_color-mix(in_oklab,var(--voyage-ink)_14%,transparent)]",
            )}
            aria-pressed={color === swatch.color}
            key={swatch.color}
            onClick={() => setColor(swatch.color)}
            style={{ backgroundColor: swatch.color }}
            type="button"
          />
        ))}
        <span aria-hidden="true" className="mx-1 h-7 w-px bg-secondary-200" />
        <button
          aria-label="Urungkan coretan terakhir"
          className="inline-flex size-11 items-center justify-center rounded-full text-secondary-600 transition-colors motion-reduce:transition-none hover:bg-primary-50 hover:text-primary-800 focus-visible:ring-3 focus-visible:ring-primary-400/40 focus-visible:outline-none"
          disabled={!strokes.length}
          onClick={() => setStrokes((current) => current.slice(0, -1))}
          type="button"
        >
          <RotateCcw className="size-5" />
        </button>
        <button
          aria-label="Hapus semua coretan"
          className="inline-flex size-11 items-center justify-center rounded-full text-student-status-danger-fg transition-colors motion-reduce:transition-none hover:bg-student-status-danger-bg focus-visible:ring-3 focus-visible:ring-student-status-danger-border focus-visible:outline-none"
          disabled={!strokes.length}
          onClick={() => setStrokes([])}
          type="button"
        >
          <Trash2 className="size-5" />
        </button>
        <span aria-hidden="true" className="mx-1 h-7 w-px bg-secondary-200" />
        <button
          aria-label="Tutup mode coretan"
          className="inline-flex size-11 items-center justify-center rounded-full text-secondary-600 transition-colors motion-reduce:transition-none hover:bg-primary-50 hover:text-primary-800 focus-visible:ring-3 focus-visible:ring-primary-400/40 focus-visible:outline-none"
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
    </dialog>
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
      className="inline-flex size-12 items-center justify-center rounded-full border border-primary-100 bg-transparent text-secondary-600 transition-colors motion-reduce:transition-none hover:bg-primary-50"
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
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border border-primary-100 bg-transparent px-5 py-3 text-sm font-medium transition-colors motion-reduce:transition-none",
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
  floatingPanels = false,
  headerActions,
  navigation,
  score,
  scoreLabel = "Skor Akhir",
  smoothHeaderDivider = false,
  summary,
  title,
}: {
  children: ReactNode;
  floatingPanels?: boolean;
  headerActions?: ReactNode;
  navigation?: ReactNode;
  score: number;
  scoreLabel?: string;
  smoothHeaderDivider?: boolean;
  summary?: ReactNode;
  title: ReactNode;
}) {
  const normalizedScore = Math.max(0, Math.min(100, score));

  return (
    <div className="student-page-canvas min-h-svh text-secondary-900">
      <header className={cn(
        "relative grid min-h-20 grid-cols-[1fr_auto_1fr] items-center bg-white px-4 py-3 sm:min-h-24 sm:px-8 print:min-h-0 print:border-0 print:px-0 print:py-3",
        smoothHeaderDivider ? "border-t-2 border-primary-800 border-b border-primary-200/80" : "border-t-4 border-primary-700 border-b border-primary-100",
      )}>
        <div className="min-w-0">
          <BrandLockup />
        </div>
        <h1 className="max-w-[50vw] truncate text-center text-lg font-semibold leading-tight text-secondary-900 sm:text-2xl">{title}</h1>
        <div className="flex justify-end gap-2 print:hidden">{headerActions}</div>
      </header>

      <div className={cn(
        "grid min-h-[calc(100svh-6rem)] print:block",
        floatingPanels
          ? "gap-6 px-4 print:px-0 lg:grid-cols-[minmax(260px,1fr)_minmax(0,3fr)_minmax(260px,1fr)] lg:items-start lg:gap-8 lg:px-4"
          : "lg:grid-cols-[minmax(280px,25vw)_minmax(0,1fr)_minmax(280px,25vw)]",
      )}>
        <aside className={cn(
          "flex flex-col py-6 print:border-0 print:py-3",
          floatingPanels
            ? "mt-4 self-start rounded-[2rem] border border-primary-100 bg-white px-4 shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)] print:px-0 lg:sticky lg:top-32 lg:mt-8 lg:max-h-[calc(100svh-10rem)] lg:px-3 lg:overflow-y-auto xl:px-3"
            : "min-h-full border-b border-primary-100 bg-white px-5 sm:px-8 lg:border-r lg:border-b-0 lg:px-8 xl:px-10 print:px-0",
        )}>
          <div className="flex justify-center">
            <div
              aria-label={`${Math.round(normalizedScore)} ${scoreLabel}`}
              className="grid size-28 shrink-0 place-items-center rounded-full p-3 sm:size-36 lg:size-44"
              style={{ background: `conic-gradient(var(--primary-700) ${normalizedScore}%, var(--primary-100) 0)` }}
            >
              <div className="grid size-full place-items-center rounded-full border-4 border-white bg-secondary-50 text-center shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)]">
                <div>
                  <p className="font-mono text-2xl font-bold tabular-nums text-primary-800 sm:text-3xl">{Math.round(normalizedScore)}</p>
                  <p className="mt-1 max-w-20 text-xs font-semibold leading-tight text-secondary-500">{scoreLabel}</p>
                </div>
              </div>
            </div>
          </div>

          {summary ? (
            <div className={cn(
              "mt-8",
              !floatingPanels && "lg:mt-auto",
            )}>
              {summary}
            </div>
          ) : null}
        </aside>

        <main className="min-w-0 px-4 py-6 sm:px-8 lg:px-7 xl:px-10 print:bg-white print:px-0 print:py-3">
          <div className="mx-auto w-full max-w-[920px]">{children}</div>
        </main>

        {navigation ? (
        <aside className={cn(
          "py-6 print:hidden",
          floatingPanels
            ? "mt-4 self-start rounded-[2rem] border border-primary-100 bg-white px-4 shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)] lg:sticky lg:top-32 lg:mt-8 lg:max-h-[calc(100svh-10rem)] lg:px-3 lg:overflow-y-auto xl:px-3"
            : "border-t border-primary-100 bg-white px-5 sm:px-8 lg:border-t-0 lg:border-l lg:px-8 xl:px-10",
        )}>
            {navigation}
        </aside>
        ) : null}
      </div>
    </div>
  );
}

function AssessmentResultNavigation({
  compact = false,
  items,
  label = "Navigasi Soal",
  onSelect,
}: {
  compact?: boolean;
  items: AssessmentResultMarkerItem[];
  label?: ReactNode;
  onSelect: (number: number) => void;
}) {
  return (
    <nav aria-label={typeof label === "string" ? label : "Navigasi hasil"}>
      <p className="sr-only">{label}</p>
      <div className={cn(
        "mt-0 grid justify-items-center",
        compact ? "grid-cols-5 gap-1" : "grid-cols-3 gap-4",
      )}>
        {items.map((item) => (
          <AssessmentResultMarker
            compact={compact}
            key={item.id ?? item.number}
            marker={item}
            onClick={() => onSelect(item.number)}
          />
        ))}
      </div>
    </nav>
  );
}

function getAssessmentResultDetails(marker: AssessmentResultMarkerItem) {
  const outcome = marker.outcome ?? (marker.state === "correct" || marker.state === "incorrect" || marker.state === "unanswered" ? marker.state : undefined);
  const labels: Record<string, string> = {
    correct: "benar",
    incorrect: "salah",
    neutral: "sedang ditinjau",
    unanswered: "tidak dijawab",
  };
  const cues: Record<string, string> = { correct: "✓", incorrect: "×", unanswered: "—" };
  return { label: outcome ? labels[outcome] ?? labels.neutral : labels.neutral, cue: outcome ? cues[outcome] ?? null : null };
}

function AssessmentResultMarker({
  compact = false,
  marker,
  onClick,
}: {
  compact?: boolean;
  marker: AssessmentResultMarkerItem;
  onClick: () => void;
}) {
  const { cue, label } = getAssessmentResultDetails(marker);

  return (
    <button
      aria-current={marker.state === "current" ? "step" : undefined}
      aria-label={`Soal ${marker.number}, ${label}`}
      className={cn(
        "flex min-h-11 min-w-11 items-center justify-center border font-semibold transition-all duration-200 motion-reduce:transition-none focus-visible:ring-3 focus-visible:ring-primary-400/30 focus-visible:outline-none",
        compact ? "size-11 rounded-xl text-xs" : "aspect-square rounded-xl text-sm",
        marker.state === "correct" && "border-student-status-success-border bg-student-status-success-bg text-student-status-success-fg",
        marker.state === "incorrect" && "border-student-status-danger-border bg-student-status-danger-bg text-student-status-danger-fg",
        marker.state === "unanswered" && "border-student-status-danger-border bg-student-status-danger-bg/80 text-student-status-danger-fg",
        marker.state === "neutral" && "border-secondary-200 bg-secondary-100 text-secondary-600",
        marker.state === "current" && "ring-2 ring-primary-700 ring-offset-2",
      )}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden="true" className="inline-flex flex-col items-center gap-0.5 leading-none">
        <span>{marker.number}</span>
        {cue ? <span className="text-xs font-bold">{cue}</span> : null}
      </span>
    </button>
  );
}

function AssessmentAnswerOption({
  disabled,
  onClick,
  option,
  selected,
  selectionMode = "single",
  textScale = "default",
}: {
  disabled?: boolean;
  onClick: () => void;
  option: { id: string; key: string; text: ReactNode };
  selected: boolean;
  selectionMode?: "single" | "multiple";
  textScale?: "compact" | "default" | "large";
}) {
  const optionScaleClass = textScale === "large"
    ? "min-h-[4.75rem] px-4 py-3"
    : textScale === "compact"
      ? "min-h-[3.75rem] px-3 py-2"
      : "min-h-[4.25rem] px-3 py-2.5";
  const optionTextClass = textScale === "large"
    ? "text-lg leading-[1.45]"
    : textScale === "compact"
      ? "text-sm leading-[1.35]"
      : "text-base leading-[1.35]";

  return (
    <button
      aria-checked={selectionMode === "multiple" ? selected : undefined}
      role={selectionMode === "multiple" ? "checkbox" : undefined}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-[1.25rem] border bg-white text-left shadow-none transition-all duration-200 motion-reduce:transition-none hover:border-primary-300 hover:bg-primary-50/60 focus-visible:ring-3 focus-visible:ring-primary-400/20 focus-visible:outline-none",
        optionScaleClass,
        selected ? "border-primary-300 bg-primary-50" : "border-primary-100",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          selectionMode === "multiple" && "rounded-md",
          selected
            ? "border-primary-700 bg-primary-700 text-white"
            : "border-secondary-200 bg-secondary-50 text-secondary-500 group-hover:border-primary-300 group-hover:bg-white",
        )}
      >
        {option.key}
      </span>
      <span className={cn("font-medium text-secondary-800", optionTextClass)}>{option.text}</span>
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

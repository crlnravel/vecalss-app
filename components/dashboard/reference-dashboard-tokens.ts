/**
 * Semantic class contracts for the extracted reference dashboard language.
 *
 * These intentionally resolve to the existing Vecalss tokens instead of
 * copying the reference app's warm-gray palette. Keeping the contracts here
 * gives future mentor/Kapten/admin surfaces one place to adopt the geometry
 * without introducing route-local shadows, colors, or status treatments.
 */
const REFERENCE_SURFACE_CLASS_NAMES = {
  inset:
    "rounded-3xl border border-primary-100 bg-primary-50/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_8px_rgba(23,107,77,0.08)]",
  raised:
    "rounded-4xl border border-primary-100 bg-white shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)]",
  raisedInteractive:
    "transition-[transform,border-color,box-shadow] duration-200 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-[0_24px_52px_-30px_rgba(23,107,77,0.55)] focus-within:border-primary-300 focus-within:shadow-[0_24px_52px_-30px_rgba(23,107,77,0.55)]",
} as const;

const REFERENCE_FIELD_LABEL_CLASS_NAME =
  "text-xs font-semibold leading-7 tracking-[0.04em] text-secondary-600";

const REFERENCE_CONTROL_CLASS_NAMES = {
  input:
    "min-h-11 w-full rounded-2xl border border-primary-100/80 bg-primary-50/70 px-4 py-3 text-sm text-secondary-900 shadow-[inset_-3px_-3px_8px_rgba(255,255,255,0.76),inset_3px_3px_8px_rgba(23,107,77,0.1)] outline-none transition-[border-color,box-shadow,background-color] placeholder:text-secondary-400 focus-visible:border-primary-500/65 focus-visible:ring-4 focus-visible:ring-primary-700/15 disabled:cursor-not-allowed disabled:opacity-55",
  select:
    "flex min-h-11 min-w-0 w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border border-primary-100/80 bg-primary-50/70 px-4 py-3 text-left text-sm font-medium text-secondary-900 shadow-[inset_-3px_-3px_8px_rgba(255,255,255,0.76),inset_3px_3px_8px_rgba(23,107,77,0.1)] outline-none transition-[border-color,box-shadow,background-color] hover:border-primary-200 hover:bg-primary-50/90 focus-visible:border-primary-500/65 focus-visible:ring-4 focus-visible:ring-primary-700/15 data-popup-open:border-primary-500/65 data-popup-open:ring-4 data-popup-open:ring-primary-700/15 disabled:cursor-not-allowed disabled:opacity-55",
  choice:
    "flex min-h-11 min-w-0 w-full items-center gap-3 rounded-2xl border border-primary-100/80 bg-primary-50/70 px-4 py-3 text-sm text-secondary-900 shadow-[inset_-3px_-3px_8px_rgba(255,255,255,0.76),inset_3px_3px_8px_rgba(23,107,77,0.1)] outline-none transition-[border-color,box-shadow,background-color] hover:border-primary-200 hover:bg-primary-50/90 focus-within:border-primary-500/65 focus-within:ring-4 focus-within:ring-primary-700/15 has-[[data-checked]]:border-primary-500/65 has-[[data-checked]]:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-55",
  file:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-primary-100/80 bg-primary-50/70 px-4 py-3 text-sm font-medium text-secondary-900 shadow-[inset_-3px_-3px_8px_rgba(255,255,255,0.76),inset_3px_3px_8px_rgba(23,107,77,0.1)] outline-none transition-[border-color,box-shadow,background-color] hover:border-primary-200 hover:bg-primary-50/90 focus-visible:border-primary-500/65 focus-visible:ring-4 focus-visible:ring-primary-700/15 disabled:cursor-not-allowed disabled:opacity-55",
} as const;

const REFERENCE_NAV_CLASS_NAMES = {
  active:
    "bg-primary-50 text-primary-800 shadow-[inset_0_-1px_0_rgba(1,76,56,0.08)]",
  base: "text-secondary-500 hover:bg-primary-50/70 hover:text-secondary-900",
} as const;

const REFERENCE_ICON_TONE_CLASS_NAMES = {
  attention: "bg-student-status-attention-bg text-student-status-attention-fg",
  danger: "bg-student-status-danger-bg text-student-status-danger-fg",
  info: "bg-student-status-info-bg text-student-status-info-fg",
  neutral: "bg-primary-50 text-primary-800",
  success: "bg-student-status-success-bg text-student-status-success-fg",
} as const;

const REFERENCE_STATUS_TONE_CLASS_NAMES = {
  archived: "neutral",
  active: "active",
  blocked: "danger",
  completed: "success",
  danger: "danger",
  done: "success",
  draft: "neutral",
  in_progress: "active",
  info: "info",
  need_help: "attention",
  neutral: "neutral",
  on_track: "success",
  paused: "attention",
  pending: "neutral",
  published: "success",
  scheduled: "info",
} as const;

const REFERENCE_STATUS_LABELS = {
  archived: "Diarsipkan",
  active: "Aktif",
  blocked: "Terblokir",
  completed: "Selesai",
  danger: "Bermasalah",
  done: "Selesai",
  draft: "Draf",
  in_progress: "Berlangsung",
  info: "Info",
  need_help: "Perlu bantuan",
  neutral: "Netral",
  on_track: "Sesuai target",
  paused: "Dijeda",
  pending: "Menunggu",
  published: "Diterbitkan",
  scheduled: "Terjadwal",
} as const;

type ReferenceIconTone = keyof typeof REFERENCE_ICON_TONE_CLASS_NAMES;
type ReferenceStatus = keyof typeof REFERENCE_STATUS_TONE_CLASS_NAMES;
type ReferenceStatusTone = (typeof REFERENCE_STATUS_TONE_CLASS_NAMES)[ReferenceStatus];

export {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
  REFERENCE_ICON_TONE_CLASS_NAMES,
  REFERENCE_NAV_CLASS_NAMES,
  REFERENCE_STATUS_LABELS,
  REFERENCE_STATUS_TONE_CLASS_NAMES,
  REFERENCE_SURFACE_CLASS_NAMES,
};
export type { ReferenceIconTone, ReferenceStatus, ReferenceStatusTone };

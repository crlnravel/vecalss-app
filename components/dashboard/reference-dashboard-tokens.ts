import {
  fieldControlClassName,
  fieldLabelClassName,
} from "@/components/ui/field-constants";
import { cn } from "@/lib/utils";

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
    "rounded-card border border-primary-100 bg-primary-50/70 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--voyage-surface)_80%,transparent),inset_0_-2px_8px_color-mix(in_oklab,var(--voyage-forest)_8%,transparent)]",
  raised:
    "rounded-card border border-primary-100 bg-white [--reference-surface-border:var(--primary-100)] shadow-[0_1px_0_color-mix(in_oklab,var(--reference-surface-border)_94%,transparent),0_12px_24px_-16px_color-mix(in_oklab,var(--voyage-forest)_38%,transparent),0_22px_42px_-28px_color-mix(in_oklab,var(--voyage-forest)_24%,transparent)]",
  tactile:
    "rounded-card border border-primary-100 bg-white shadow-[0_6px_0_var(--voyage-sea-glass),0_18px_36px_-26px_color-mix(in_oklab,var(--voyage-forest)_46%,transparent)]",
  tactileActive:
    "rounded-card border border-primary-100 bg-white shadow-[0_6px_0_var(--voyage-deep-hover),0_20px_38px_-26px_color-mix(in_oklab,var(--voyage-forest)_60%,transparent)]",
  raisedInteractive:
    "transition-[transform,border-color,box-shadow] duration-200 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-[0_1px_0_color-mix(in_oklab,var(--reference-surface-border)_94%,transparent),0_18px_34px_-18px_color-mix(in_oklab,var(--voyage-forest)_46%,transparent),0_28px_56px_-28px_color-mix(in_oklab,var(--voyage-forest)_34%,transparent)] focus-within:border-primary-300 focus-within:shadow-[0_1px_0_color-mix(in_oklab,var(--reference-surface-border)_94%,transparent),0_18px_34px_-18px_color-mix(in_oklab,var(--voyage-forest)_46%,transparent),0_28px_56px_-28px_color-mix(in_oklab,var(--voyage-forest)_34%,transparent)]",
  raisedStableInteractive:
    "transition-[border-color,box-shadow] duration-200 motion-safe:hover:shadow-[0_1px_0_color-mix(in_oklab,var(--reference-surface-border)_94%,transparent),0_18px_34px_-18px_color-mix(in_oklab,var(--voyage-forest)_46%,transparent),0_28px_56px_-28px_color-mix(in_oklab,var(--voyage-forest)_34%,transparent)] focus-within:border-primary-300 focus-within:shadow-[0_1px_0_color-mix(in_oklab,var(--reference-surface-border)_94%,transparent),0_18px_34px_-18px_color-mix(in_oklab,var(--voyage-forest)_46%,transparent),0_28px_56px_-28px_color-mix(in_oklab,var(--voyage-forest)_34%,transparent)] motion-reduce:transition-none",
} as const;

const REFERENCE_SHADOW_CLASS_NAMES = {
  tactile:
    "shadow-[0_6px_0_var(--voyage-sea-glass),0_18px_36px_-26px_color-mix(in_oklab,var(--voyage-forest)_46%,transparent)]",
  tactileActive:
    "shadow-[0_9px_0_var(--voyage-deep-hover),0_26px_48px_-30px_color-mix(in_oklab,var(--voyage-forest)_68%,transparent)]",
} as const;

const REFERENCE_INTERACTION_CLASS_NAMES = {
  tactile:
    "transition-[transform,box-shadow,border-color,background-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-[0_9px_0_var(--voyage-deep-hover),0_26px_48px_-30px_color-mix(in_oklab,var(--voyage-forest)_68%,transparent)] motion-safe:focus-visible:-translate-y-1 motion-safe:focus-visible:shadow-[0_9px_0_var(--voyage-deep-hover),0_26px_48px_-30px_color-mix(in_oklab,var(--voyage-forest)_68%,transparent)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:focus-visible:translate-y-0",
} as const;

const REFERENCE_FIELD_LABEL_CLASS_NAME = fieldLabelClassName;

const REFERENCE_CONTROL_CLASS_NAMES = {
  input: fieldControlClassName,
  select: cn(
    fieldControlClassName,
    "flex items-center justify-between gap-3 overflow-hidden text-left font-medium hover:border-primary-200 hover:bg-primary-50/90 data-popup-open:border-primary-500/65 data-popup-open:ring-3 data-popup-open:ring-primary-700/15",
  ),
  choice: cn(
    fieldControlClassName,
    "flex items-center gap-3 hover:border-primary-200 hover:bg-primary-50/90 focus-within:border-primary-500/65 focus-within:ring-3 focus-within:ring-primary-700/15 has-[[data-checked]]:border-primary-500/65 has-[[data-checked]]:bg-primary-50",
  ),
  file: cn(
    fieldControlClassName,
    "inline-flex w-fit items-center justify-center gap-2 font-medium hover:border-primary-200 hover:bg-primary-50/90",
  ),
} as const;

const REFERENCE_NAV_CLASS_NAMES = {
  active:
    "bg-primary-50 text-primary-800 shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)]",
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
  active: "info",
  blocked: "danger",
  completed: "success",
  danger: "danger",
  done: "success",
  draft: "neutral",
  in_progress: "info",
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
  REFERENCE_INTERACTION_CLASS_NAMES,
  REFERENCE_NAV_CLASS_NAMES,
  REFERENCE_SHADOW_CLASS_NAMES,
  REFERENCE_STATUS_LABELS,
  REFERENCE_STATUS_TONE_CLASS_NAMES,
  REFERENCE_SURFACE_CLASS_NAMES,
};
export type { ReferenceIconTone, ReferenceStatus, ReferenceStatusTone };

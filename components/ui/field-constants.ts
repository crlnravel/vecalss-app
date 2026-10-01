// Visual source: the original Student /settings Email field, including its
// near-white green fill and inset depth. Entered values use Voyage Deep green;
// placeholders remain muted. Shared controls
// inherit this recipe. Corners now follow the shared 12px controls per the
// latest user refinement; use the same radius utility as Button so fields cannot
// drift. Fill, typography and inset depth stay reference-led.
const fieldControlClassName =
  "min-h-[44px] min-w-0 w-full rounded-control border border-primary-100/80 bg-secondary-50 px-4 py-3 font-sans text-sm font-normal leading-5 text-voyage-deep shadow-[inset_-3px_-3px_8px_color-mix(in_oklab,var(--voyage-surface)_76%,transparent),inset_3px_3px_8px_color-mix(in_oklab,var(--voyage-forest)_10%,transparent)] outline-none transition-[border-color,box-shadow,background-color] placeholder:text-secondary-400 focus-visible:border-primary-500/65 focus-visible:ring-3 focus-visible:ring-primary-700/15 disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-student-status-danger-border aria-invalid:ring-3 aria-invalid:ring-student-status-danger-border/25 motion-reduce:transition-none";

const fieldLabelClassName =
  "font-heading text-xs leading-7 font-semibold tracking-[0.04em] text-secondary-600";

export { fieldControlClassName, fieldLabelClassName };

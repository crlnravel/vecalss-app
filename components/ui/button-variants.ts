import { cva } from "class-variance-authority";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        brand:
          "border-primary-700 bg-primary-700 text-white hover:bg-primary-800 focus-visible:border-primary-700 focus-visible:ring-primary-700/25",
        marketing:
          "rounded-full border-voyage-deep bg-voyage-deep text-white hover:bg-voyage-deep-hover focus-visible:border-voyage-deep focus-visible:ring-voyage-leaf/45",
        marketingOutline:
          "rounded-full border-voyage-deep/20 bg-white text-voyage-deep hover:border-voyage-deep/35 hover:bg-voyage-sea-glass-wash focus-visible:border-voyage-leaf focus-visible:ring-voyage-leaf/45",
        marketingOnDark:
          "rounded-full border-white bg-white text-voyage-deep hover:bg-white/90 focus-visible:border-white focus-visible:ring-white/45",
        onboarding:
          "rounded-full border-voyage-warm-sun bg-voyage-warm-sun text-voyage-warm-sun-ink hover:bg-voyage-warm-sun/85 focus-visible:border-voyage-leaf focus-visible:ring-voyage-leaf/45",
        learning:
          "rounded-2xl border-voyage-forest bg-voyage-forest text-white shadow-[0_4px_0_#0f563b] hover:bg-voyage-leaf focus-visible:border-voyage-leaf focus-visible:ring-voyage-leaf/45 motion-safe:active:translate-y-1 motion-safe:active:shadow-none motion-reduce:transform-none",
        learningComplete:
          "rounded-2xl border-student-status-success-border bg-student-status-success-bg text-student-status-success-fg hover:bg-student-status-success-bg/80 focus-visible:border-student-status-success-border focus-visible:ring-student-status-success-border/45",
        learningAttention:
          "rounded-xl border-voyage-warm-sun bg-voyage-warm-sun text-voyage-warm-sun-ink shadow-[0_4px_0_#d9ad32] hover:bg-voyage-warm-sun/85 focus-visible:border-voyage-warm-sun focus-visible:ring-voyage-warm-sun/45 motion-safe:active:translate-y-1 motion-safe:active:shadow-none motion-reduce:transform-none",
        brandOutline:
          "border-voyage-soft-border bg-voyage-surface text-voyage-ink hover:border-voyage-sea-glass hover:bg-voyage-sea-glass-wash focus-visible:border-voyage-leaf focus-visible:ring-voyage-leaf/35",
        context:
          "border-primary-100 bg-white text-secondary-950 hover:border-primary-300 hover:bg-primary-50/40 focus-visible:border-primary-500 focus-visible:ring-primary-500/20",
        contextSelected:
          "border-primary-500 bg-primary-50 text-secondary-950 hover:border-primary-600 hover:bg-primary-50 focus-visible:border-primary-600 focus-visible:ring-primary-500/20",
        attentionOutline:
          "border-student-status-attention-border bg-white text-student-status-attention-fg hover:bg-student-status-attention-bg focus-visible:border-student-status-attention-border focus-visible:ring-student-status-attention-border/35",
        attention:
          "border-student-status-attention-solid-bg bg-student-status-attention-solid-bg text-student-status-attention-solid-fg hover:bg-student-status-attention-solid-bg/85 focus-visible:border-student-status-attention-border focus-visible:ring-student-status-attention-border/35",
        dangerOutline:
          "border-student-status-danger-border bg-white text-student-status-danger-fg hover:bg-student-status-danger-bg focus-visible:border-student-status-danger-border focus-visible:ring-student-status-danger-border/35",
        inverseOutline:
          "border-white/20 bg-transparent text-white hover:bg-white/10 focus-visible:border-white/35 focus-visible:ring-white/15",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-transparent dark:hover:bg-input/30",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "border-student-status-danger-solid-bg bg-student-status-danger-solid-bg text-student-status-danger-solid-fg hover:brightness-95 focus-visible:border-student-status-danger-solid-bg focus-visible:ring-student-status-danger-solid-bg/25",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-11 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-10 gap-1 px-3.5 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        lg: "h-12 gap-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        marketing:
          "h-14 gap-2 rounded-full px-7 py-4 text-base font-bold",
        marketingCompact:
          "h-11 gap-2 rounded-full px-5 text-sm font-semibold",
        onboarding:
          "min-h-13 h-auto gap-2 px-6 py-3.5 text-base font-bold",
        learning:
          "h-12 gap-2 px-5 text-base font-bold",
        learningAttention:
          "h-11 gap-2 px-4 text-sm font-semibold",
        icon: "size-11",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-10",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export { buttonVariants };

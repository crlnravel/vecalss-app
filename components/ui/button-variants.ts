import { cva } from "class-variance-authority"

const tactileButtonClassName =
  "shadow-[0_4px_0_var(--button-tactile-edge),0_14px_28px_-22px_color-mix(in_oklab,var(--voyage-deep)_54%,transparent)] transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:shadow-[0_6px_0_var(--button-tactile-edge),0_18px_34px_-22px_color-mix(in_oklab,var(--voyage-deep)_60%,transparent)] active:shadow-[0_1px_0_var(--button-tactile-edge)]"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-control border bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none focus-visible:border-voyage-leaf focus-visible:ring-3 focus-visible:ring-voyage-leaf/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-busy:cursor-wait aria-busy:opacity-80 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "[--button-tactile-edge:var(--voyage-deep-hover)] border-voyage-deep bg-voyage-deep text-white hover:border-voyage-deep-hover hover:bg-voyage-deep-hover focus-visible:border-voyage-deep",
        outline:
          "[--button-tactile-edge:var(--voyage-sea-glass)] border-voyage-soft-border bg-voyage-surface text-voyage-ink hover:border-voyage-leaf/45 hover:bg-voyage-sea-glass-wash data-active:border-voyage-deep data-active:bg-voyage-sea-glass-wash data-active:text-voyage-deep",
        destructive:
          "[--button-tactile-edge:color-mix(in_oklab,var(--student-status-danger-solid-bg)_78%,black)] border-student-status-danger-solid-bg bg-student-status-danger-solid-bg text-student-status-danger-solid-fg hover:border-student-status-danger-solid-bg hover:bg-student-status-danger-solid-bg/90 focus-visible:border-student-status-danger-solid-bg focus-visible:ring-student-status-danger-solid-bg/30",
        warning:
          "[--button-tactile-edge:color-mix(in_oklab,var(--student-status-attention-solid-bg)_82%,black)] border-student-status-attention-solid-bg bg-student-status-attention-solid-bg text-student-status-attention-solid-fg hover:border-student-status-attention-solid-bg hover:bg-student-status-attention-solid-bg/90 focus-visible:border-student-status-attention-border focus-visible:ring-student-status-attention-border/40",
        quiet:
          "border-transparent bg-transparent text-secondary-600 shadow-none transition-colors hover:text-voyage-deep focus-visible:border-transparent data-active:text-voyage-deep",
        inverse:
          "[--button-tactile-edge:var(--voyage-sea-glass)] border-white bg-white text-voyage-deep hover:border-voyage-sea-glass hover:bg-voyage-sea-glass-wash focus-visible:border-white focus-visible:ring-white/40 focus-visible:ring-offset-voyage-deep",
      },
      size: {
        xs: "h-[40px] gap-[4px] px-[12px] text-[12px] has-data-[icon=inline-end]:pr-[8px] has-data-[icon=inline-start]:pl-[8px]",
        sm: "h-[40px] gap-1 px-3.5 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        default:
          "h-[44px] gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        lg: "h-[48px] gap-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        "icon-sm": "size-[40px]",
        icon: "size-[44px]",
        "icon-lg": "size-[48px]",
      },
    },
    compoundVariants: [
      {
        variant: ["default", "outline", "destructive", "warning", "inverse"],
        className: tactileButtonClassName,
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export { buttonVariants }

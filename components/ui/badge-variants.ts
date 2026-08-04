import { cva } from "class-variance-authority";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 font-medium leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        accent: "bg-accent-300 text-secondary-900",
        mint: "bg-primary-200 text-secondary-900",
        neutral: "bg-white text-secondary-900",
      },
      size: {
        section: "text-4xl md:text-5xl",
        card: "text-2xl md:text-4xl",
        footer: "text-ui-lg",
        ui: "text-xs",
      },
    },
    defaultVariants: {
      variant: "accent",
      size: "card",
    },
  },
);

export { badgeVariants };
